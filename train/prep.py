"""Cut one window out of the Hansen GFC tile 10S_060W (Mato Grosso, Brazil) and save it."""
import sys, numpy as np, tifffile, zarr
R0, R1, C0, C1 = 5000, 8000, 14000, 18000
src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/defo'
def win(f):
    z = zarr.open(tifffile.imread(f'{src}/{f}', aszarr=True), mode='r')
    z = z['0'] if hasattr(z, 'keys') else z
    return np.asarray(z[R0:R1, C0:C1])
np.savez_compressed('window.npz', loss=win('lossyear.tif'), tc=win('tc.tif'), r0=R0, c0=C0)
print('saved', R1 - R0, C1 - C0)
