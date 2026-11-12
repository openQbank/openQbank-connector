# Manual release steps (maintainer)

1. Rename this GitHub repo to `openHyGuru-connector` (private) and create public `openQbank/openQbank-connector` from this directory.
2. Publish `@openqbank/extract` from `../qbank-extract` to GitHub Packages.
3. Add GitHub secret `EXTRACT_PACKAGE_TOKEN` (`read:packages`) on the public repo.
4. Create a **new** Chrome Web Store listing for openQbank Connector; paste its URL into `OPENQBANK_CONNECTOR_STORE_URL` in the HyGuru repo `src/App.tsx`.
5. Deploy API changes on `openqbank-api.fly.dev` before shipping the public extension.
