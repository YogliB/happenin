const backIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;

export function renderBackButton(label = "Back"): string {
	return `<button type="button" class="detail-back" onclick="backToDashboard()" aria-label="back to dashboard">${backIcon}<span>${label}</span></button>`;
}
