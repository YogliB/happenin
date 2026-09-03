# Verify: Dashboard session tree

## Commands run

```bash
nub run typecheck
nub run build
nub run test:ci
nub run lint:ci
nub run format:ci
nub run duplicates:ci
nub run knip:ci
```

## Results

| Check      | Result                       |
| ---------- | ---------------------------- |
| typecheck  | ✅                           |
| build      | ✅                           |
| test:ci    | ✅ 204 passed, 100% coverage |
| lint:ci    | ✅                           |
| format:ci  | ✅                           |
| duplicates | ✅ 0 clones                  |
| knip       | ✅                           |
