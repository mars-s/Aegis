let navigation;
export function connectLibrary(api) { navigation = api; }
export const openLibraryBoard = id => navigation?.open(id);
export const createLibraryBoard = body => navigation?.create(body);
export const loadLibraryBoard = id => navigation?.load(id);
export const renameLibraryBoard = (id, name) => navigation?.rename(id, name);
