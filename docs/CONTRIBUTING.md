# Contributing to happenin

Thanks for taking the time to contribute.

All types of contributions are encouraged and valued. See the [Table of Contents](#table-of-contents) for different ways to help.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [I Have a Question](#i-have-a-question)
- [I Want To Contribute](#i-want-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Your First Code Contribution](#your-first-code-contribution)
  - [Improving The Documentation](#improving-the-documentation)
- [Styleguides](#styleguides)
  - [Commit Messages](#commit-messages)

## Code of Conduct

This project and everyone participating in it is governed by the
[happenin Code of Conduct](https://github.com/YogliB/happenin/blob/main/docs/CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code.

## I Have a Question

Before you ask a question, search existing [Issues](https://github.com/YogliB/happenin/issues).
If you still need help, open an issue with as much context as possible.

## I Want To Contribute

### Legal Notice

When contributing to this project, you must agree that you have authored 100% of the content and that the content may be provided under the project licence.

### Reporting Bugs

A good bug report should include:

- Steps to reproduce.
- Expected and actual behavior.
- OS, platform, and version.
- Project version.

If the issue is security-related, do not report it publicly. See [docs/SECURITY.md](SECURITY.md).

### Suggesting Enhancements

- Search existing issues first.
- Explain the current behavior, expected behavior, and why the change is useful.

### Your First Code Contribution

Development requires Node 24 or later (`.node-version` pins it). Node `>= 22.13` can run happenin but cannot build it.

```bash
git clone git@github.com:YogliB/happenin.git
cd happenin
npm install
npm run build
```

If you use `nub`, run `nub install` and `nub run build` instead.

Before opening a pull request, run:

```bash
npm run build
npm run typecheck
npm run format
npm run lint
npm run duplicates:ci
npm run knip:ci
npm run test:ci
```

If you use `nub`, run `nub run <script>` instead of `npm run <script>`.

Keep changes focused. Squash to a single commit and write a [Conventional Commit](https://www.conventionalcommits.org/) message.

### Improving The Documentation

Documentation lives in `README.md`, `AGENTS.md`, `CLAUDE.md`, `llms.txt`, and `docs/`. Keep them aligned when changing workflows or navigation. A custom `oxlint-repo-guidelines/no-more-docs` rule blocks new Markdown or `docs/` files that are not in the allow-list. Add new docs to `scripts/oxlint-repo-guidelines.js` and to `AGENTS.md` before opening a PR.

## Styleguides

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/).
