/* Only these keys belong to this application on the shared GitHub Pages origin. */
(() => {
  const keys = {
    workspace: 'poltava-energy-workspace-v2',
    publication: 'poltava-energy-publication-v2',
    gas: 'poltava-energy-gas-v2'
  };
  const previous = ['poltava-energy-v1', 'poltava-energy-publication-v1', 'energy-gas-v1'];
  function remove(keysToClear) {
    for (const name of keysToClear) localStorage.removeItem(name);
  }
  try { remove(previous); } catch { /* Storage may be disabled. */ }
  window.EnergyStorage = {keys, clear() { remove([...Object.values(keys), ...previous]); }};
})();
