# Clearing Front

A model that ranks standing forest in northern Mato Grosso, Brazil by how likely it is to be cleared in the next eight years, and a page that shows how it did on ground it never trained on.

Live: https://aditya2375.github.io/clearing-front/

## Setup

- Data: Global Forest Change v1.11 (Hansen et al., Science 342, 2013; CC BY 4.0), tile 10S_060W, a 1 by 0.75 degree window. 30 m pixels grouped into 150 m cells.
- Features use loss up to 2015 only (distance to cleared land, clearing and forest share at 450 m to 9 km, recent clearing, canopy cover). No coordinates.
- Label: a forest cell is positive if any of it is lost in 2016 to 2023.
- Split by place: train on the west two thirds, test on the east third, with a gap of 8 cells.
- Model: gradient-boosted trees (scikit-learn), compared with distance-only and clearing-density baselines.

## Result on the held-out third (63,182 cells, 39% cleared later)

| Ranking by | AUC | Top 5% cleared | Top 10% cleared |
|---|---|---|---|
| Model | 0.67 | 73% | 69% |
| Distance to cleared land | 0.61 | 62% | 56% |
| Clearing density, 3 km | 0.57 | 42% | 45% |

Modest and honest: AUC is 0.67, and training on the east and testing on the west gives 0.58. The east was cleared about twice as often as the west. Tree-cover loss also includes fire and harvest, not only conversion to farmland. It is a ranking aid, not a forecast for single farms.

## Run

Static files. `python3 -m http.server` in this folder. To rebuild: download the `lossyear` and `treecover2000` tiles, run `train/prep.py` then `train/model.py` (numpy, scipy, scikit-learn, tifffile, zarr).

MIT licence.

## Notes on rigor

- The model was fit once. No hyperparameter was tuned against the held-out strip.
- Features use windows up to 9 km, so some feature windows of held-out cells reach into the 8-cell gap and the training side. Labels never cross the gap.
- AUC by three horizontal bands of the held-out strip: 0.68, 0.57, 0.61. The headline 0.67 is one draw, not a tight estimate.
