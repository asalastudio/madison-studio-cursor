# Reference export drops

Cowork drops validated PSD re-exports here, one dated folder per family:

```
<family>/<YYYY-MM-DD>/identity-cap-on/<websiteSku>__<graceSku>.png
<family>/<YYYY-MM-DD>/pdp-cap-off-sidecar/<websiteSku>__<graceSku>.png
```

Validate before handing off:

```
npx tsx scripts/best-bottles/validate-reference-export-drop.ts public/data/reference-exports/<family>/<date>
```

Contract and rationale: `docs/best-bottles-file-naming-contract.md`.
Which families can be prepared: `docs/best-bottles-reference-prep-program.md`.
