const ALLOWED = /^\s*(oxlint|eslint|@ts-|istanbul|c8[\s-]|v8[\s-])/;

const plugin = {
	meta: {
		name: "no-comment",
	},
	rules: {
		"no-comment": {
			create(context) {
				return {
					Program() {
						const source = context.sourceCode ?? context.getSourceCode?.();
						if (!source) {
							return;
						}

						for (const node of source.getAllComments?.() ?? []) {
							const text = source.getText(node);
							if (text.startsWith("#!")) {
								continue;
							}

							const isTripleSlash =
								node.type === "Line" &&
								/^\/<(reference|amd-module|amd-dependency|lib)\b/.test(node.value);
							if (isTripleSlash || ALLOWED.test(node.value)) {
								continue;
							}

							context.report({
								loc: node.loc,
								message:
									"Comments hide intent. Rename variables or extract named functions instead. Reserve `// oxlint-disable-next-line no-comment/no-comment` only for platform constraints or browser quirks.",
							});
						}
					},
				};
			},
		},
	},
};

export default plugin;
