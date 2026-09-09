# GitHub Pages deployment

The application is a static HTML/CSS/JavaScript project. Publish the contents of `dist`, not the repository root.

## Required source

Import the original `hongseong-adventure-v1.3.2-source(1).zip` into the root of this repository after removing its single enclosing directory. Keep `dist`, `tests`, `scripts`, `research`, `package.json`, `README.md`, `CHANGELOG.md`, and `.gitignore`. The `.openai` hosting metadata is not needed for GitHub Pages and should not be uploaded. Preserve source and asset attributions.

Expected ZIP SHA-256: `96a996350f9ba02fb670f78529926c616c86037471908c49d3260f729eb732bf`.

## Publishing

Set Settings > Pages > Build and deployment > Source to GitHub Actions. A push to `main` that includes the application source runs the tests and publishes `dist`. The workflow can also be started manually from Actions > Publish Hongseong Adventure > Run workflow.

Expected URL after successful application deployment: https://doguri25.github.io/hongseong-adventure/

The workflow explicitly skips publishing when the application source is absent. A successful configuration-only workflow run does not mean the application is published. Confirm that the **deploy** job completed successfully and that the URL opens the game, not only the repository README.

## Local verification performed on the supplied archive

The original v1.3.2 archive passed all 71 Node.js tests in this workspace. A scan for common credential patterns found no matches; this is not a full security audit. Browser/device testing and public application deployment have not yet been verified.

Official references: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages and https://docs.github.com/en/rest/pages/pages
