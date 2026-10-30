let mapsPromise: Promise<void> | null = null;
export function loadGoogle(key: string) {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const callback = '__waylineGoogleReady';
    const target = window as unknown as Record<string, unknown>;
    const timer = setTimeout(() => { mapsPromise = null; reject(new Error('Google Maps did not load. Check your connection and key settings.')); }, 20000);
    target[callback] = () => { clearTimeout(timer); delete target[callback]; resolve(); };
    target.gm_authFailure = () => { clearTimeout(timer); mapsPromise = null; reject(new Error('Google rejected the browser key. Check billing, API access and website restrictions.')); window.dispatchEvent(new Event('google-auth-error')); };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${callback}&language=en&region=CA`;
    script.async = true; script.onerror = () => { clearTimeout(timer); mapsPromise = null; script.remove(); reject(new Error('Unable to reach Google Maps.')); };
    document.head.append(script);
  });
  return mapsPromise;
}
