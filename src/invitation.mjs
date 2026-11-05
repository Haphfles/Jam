export function invitationURL(value, base) {
  const expected = new URL('./controller.html',base);
  let link;
  try { link = new URL(value.trim()); } catch { throw Error('Enter a valid invitation link.'); }
  const params = new URLSearchParams(link.hash.slice(1));
  if (link.origin !== expected.origin || link.pathname !== expected.pathname || link.username || link.password ||
      !/^[a-f0-9]{32}$/.test(params.get('room') || '') || !/^[a-f0-9]{32}$/.test(params.get('host') || '')) {
    throw Error('Use a GREENLIGHT JAMMER invitation from this site.');
  }
  return link.href;
}
export function hostIsLive(host) { return !!host && host.network === 'ready' && host.running === true; }
