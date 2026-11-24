"""Which standing forest gets cleared next? Cells are 150 m (5x5 Landsat pixels, about 2.25 ha).
Features use only what was known at the end of 2015. The label is any clearing in 2016-2023.
Train on the west two thirds, test on the east third, with a gap so no neighbourhood is shared."""
import json, numpy as np
from scipy import ndimage as ndi
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score

d = np.load('window.npz'); loss, tc = d['loss'], d['tc']
B = 5; H0, W0 = loss.shape; H, W = H0 // B, W0 // B
def blk(a, fn='mean'):
    a = a[:H * B, :W * B].reshape(H, B, W, B).astype(np.float32)
    return a.mean((1, 3)) if fn == 'mean' else a.max((1, 3))
past_px = (loss >= 1) & (loss <= 15); fut_px = loss >= 16
forest_px = (tc >= 30) & ~past_px
f_forest = blk(forest_px)          # forest share at end of 2015
f_past = blk(past_px)
f_recent = blk((loss >= 13) & (loss <= 15))
f_tc = blk(tc) / 100.0
y_cell = blk(fut_px & forest_px, 'max') > 0
forest = f_forest >= 0.5
CELL = 150.0
def dens(m, r): return ndi.uniform_filter(m.astype(np.float32), size=2 * r + 1, mode='nearest')
nonf = ~forest
feats = {
    'dist_cleared_m': ndi.distance_transform_edt(f_past < 0.2) * CELL,
    'dist_nonforest_m': ndi.distance_transform_edt(~nonf) * CELL,
    'cleared_here': f_past,
    'cleared_450m': dens(f_past, 1), 'cleared_1km': dens(f_past, 3), 'cleared_3km': dens(f_past, 10), 'cleared_9km': dens(f_past, 30),
    'recent_1km': dens(f_recent, 3), 'recent_3km': dens(f_recent, 10), 'recent_9km': dens(f_recent, 30),
    'forest_1km': dens(f_forest, 3), 'forest_3km': dens(f_forest, 10),
    'canopy_cover': f_tc,
}
names = list(feats); X = np.stack([feats[k] for k in names], -1).astype(np.float32)
cols = np.arange(W)[None, :].repeat(H, 0); cut = int(W * 2 / 3)
train_m = forest & (cols < cut - 8); test_m = forest & (cols >= cut + 8)
Xtr, ytr = X[train_m], y_cell[train_m]; Xte, yte = X[test_m], y_cell[test_m]
print('cells train', len(ytr), 'rate', ytr.mean(), 'test', len(yte), 'rate', yte.mean())
bi = names.index('dist_cleared_m')
lr = LogisticRegression().fit(np.log1p(Xtr[:, [bi]]), ytr)
p_dist = lr.predict_proba(np.log1p(Xte[:, [bi]]))[:, 1]
p_dens = Xte[:, names.index('cleared_3km')]
model = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.06, max_leaf_nodes=16, min_samples_leaf=60, l2_regularization=2.0, random_state=0).fit(Xtr, ytr)
p_model = model.predict_proba(Xte)[:, 1]
def pk(p, y, f): k = int(len(p) * f); o = np.argsort(-p)[:k]; return float(y[o].mean()), float(y[o].sum() / y.sum())
def rep(p):
    a5, r5 = pk(p, yte, .05); a10, r10 = pk(p, yte, .10); a20, r20 = pk(p, yte, .20)
    return dict(auc=float(roc_auc_score(yte, p)), ap=float(average_precision_score(yte, p)), prec5=a5, rec5=r5, prec10=a10, rec10=r10, prec20=a20, rec20=r20)
M = dict(cell_m=150, base_rate=float(yte.mean()), train_base_rate=float(ytr.mean()), test_cells=int(len(yte)), train_cells=int(len(ytr)),
         model=rep(p_model), distance_only=rep(p_dist), clearing_density_3km=rep(p_dens), features=names)
# Second opinion with the roles swapped: train on the east, test on the west.
tr2 = forest & (cols >= cut + 8); te2 = forest & (cols < cut - 8)
m2 = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.06, max_leaf_nodes=16, min_samples_leaf=60, l2_regularization=2.0, random_state=0).fit(X[tr2], y_cell[tr2])
M['swapped_auc'] = float(roc_auc_score(y_cell[te2], m2.predict_proba(X[te2])[:, 1]))
rng = np.random.default_rng(1); si = rng.choice(len(yte), min(40000, len(yte)), replace=False)
ap0 = average_precision_score(yte[si], model.predict_proba(Xte[si])[:, 1]); imp = {}
for j, n in enumerate(names):
    xs = Xte[si].copy(); xs[:, j] = rng.permutation(xs[:, j]); imp[n] = float(ap0 - average_precision_score(yte[si], model.predict_proba(xs)[:, 1]))
M['importance'] = imp
print(json.dumps({k: v for k, v in M.items() if k != 'features'}, indent=1)); json.dump(M, open('metrics_raw.json', 'w'), indent=1)
risk = np.zeros((H, W), np.float32); risk[forest] = model.predict_proba(X[forest])[:, 1]
bl = np.zeros((H, W), np.float32); bl[forest] = lr.predict_proba(np.log1p(X[forest][:, [bi]]))[:, 1]
status = np.zeros((H, W), np.uint8); status[forest] = 1; status[(~forest) & (f_past >= 0.3)] = 2; status[forest & y_cell] = 3
np.savez_compressed('maps.npz', risk=risk, base=bl, status=status, cut=cut)
