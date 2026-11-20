# Deployment

The site is static and is built, not committed. `npm run build` puts the 3D game in `dist/` (`index.html`, `assets/`, `data/`, `models/`) and copies the frozen 2D game from `app2d/` into `dist/2d/`, byte for byte. Every URL in the build is relative, because GitHub Pages serves the site under `/hongseong-adventure/`.

## Build and test

```bash
npm ci            # the exact versions in package-lock.json
npm run build     # the 3D into dist/, the 2D into dist/2d/
npm test          # the 2D tests
npm run test:3d   # the 3D tests
```

## GitHub Pages

Settings > Pages > Build and deployment > Source is GitHub Actions. `.github/workflows/deploy-pages.yml` runs the four commands above on a push to `main` that changes `app2d/`, `app3d/`, `tools/build/`, `tests/`, `package.json`, `package-lock.json` or the workflow itself, then uploads `dist/` and publishes it. It can also be started from Actions > Publish Hongseong Adventure > Run workflow.

Address: https://doguri25.github.io/hongseong-adventure/ (the 3D QR code points here).

A run that finds no `app2d/index.html` skips publishing. Check that the **deploy** job finished and that the address opens the game.

## Vercel

`vercel.json` holds the same steps: install with `npm ci`, build with `npm run build && npm test && npm run test:3d`, and serve `dist`.

## Going live

Merging into `main` switches the live site. Work on other branches does not change it.

Official references: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages and https://docs.github.com/en/rest/pages/pages
