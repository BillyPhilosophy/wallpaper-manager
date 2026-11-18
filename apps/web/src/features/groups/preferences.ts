const defaultGroupKey = 'wallpaper-library-default-group';

export function defaultLibraryGroup(): string {
  try { return localStorage.getItem(defaultGroupKey) || ''; } catch { return ''; }
}

export function setDefaultLibraryGroup(groupId: string): void {
  try { localStorage.setItem(defaultGroupKey, groupId); } catch { }
}
