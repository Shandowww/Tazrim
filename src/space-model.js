// A display filter never grants access. Resolve authorization on every server request.
export function budgetSpaceScope(userId, budgetId = 'personal') {
 if (typeof userId !== 'string' || !userId) throw Error('Missing signed-in identity');
 if (budgetId === 'personal') return 'personal:' + userId;
 if (typeof budgetId !== 'string' || !budgetId) throw Error('Invalid budget identity');
 return 'budget:' + budgetId;
}
export function spaceEntityKey(scope, kind, id) {
 if (![scope, kind, id].every(value => typeof value === 'string' && value.length)) throw Error('Incomplete entity reference');
 return JSON.stringify([scope, kind, id]);
}
export function spaceDeviceKey(userId) {
 if (typeof userId !== 'string' || !userId) throw Error('Missing signed-in identity');
 return 'monthly-flow-spaces-v1:' + JSON.stringify(userId);
}
export function visibleBudgetSpaces(spaces, preference = {}) {
 const hasAdditional = spaces.some(space => space.id !== 'personal');
 return spaces.filter(space => space.id !== 'personal' || !hasAdditional || preference.personal !== 'later' || space.hasData !== false);
}
export function chooseBudgetSpace(spaces, preference = {}, requested = '') {
 const visible = visibleBudgetSpaces(spaces, preference);
 return visible.find(space => space.id === requested)?.id
  ?? visible.find(space => space.id === preference.active)?.id
  ?? visible[0]?.id ?? 'personal';
}
