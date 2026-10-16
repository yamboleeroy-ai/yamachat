const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const assetPath = path.join(root,
  'products/yamasearch/android/app/src/main/assets/yamablock-youtube.js');
const activityPath = path.join(root,
  'products/yamasearch/android/app/src/main/java/eu/yamachat/yamasearch/BrowserActivity.java');
const helperPath = path.join(root,
  'products/yamasearch/android/app/src/main/java/eu/yamachat/yamasearch/YamaBlockPageFilter.java');

const template = fs.readFileSync(assetPath, 'utf8');
const script = template;

assert(!/setTimeout|setInterval/.test(template),
  'The first-load fix must be event-driven, not timer-based');

function page(hostname, fetchImpl, topFrame = true) {
  const sandbox = {
    URL,
    Headers,
    Response,
    location: {hostname, href: `https://${hostname}/watch?v=test`},
    fetch: fetchImpl
  };
  sandbox.window = sandbox;
  sandbox.top = topFrame ? sandbox : {};
  vm.runInNewContext(script, sandbox, {filename: 'yamablock-youtube.js'});
  return sandbox;
}

(async () => {
  const nativeFetch = async () => new Response(JSON.stringify({
    videoDetails: {videoId: 'test'},
    adPlacements: [{kind: 'preroll'}],
    playerAds: [{kind: 'companion'}],
    adSlots: [{kind: 'slot'}]
  }), {status: 200, headers: {'content-type': 'application/json'}});

  const youtube = page('www.youtube.com', nativeFetch);
  youtube.ytInitialPlayerResponse = {
    videoDetails: {videoId: 'first'},
    adPlacements: [{}],
    playerAds: [{}],
    adSlots: [{}]
  };
  assert.deepEqual(Object.keys(youtube.ytInitialPlayerResponse).sort(), ['videoDetails'],
    'Embedded first-player response must be pruned before YouTube consumes it');

  const laterResponse = await youtube.fetch(
    'https://www.youtube.com/youtubei/v1/player?key=test');
  const later = await laterResponse.json();
  assert.deepEqual(Object.keys(later).sort(), ['videoDetails'],
    'Later fetch-based player responses must be pruned');

  assert.equal(youtube.__yamaBlockApply, undefined,
    'The page must not receive a writable blocker switch or exception data');
  assert.equal(youtube.__yamaBlockAndroidInstalled, undefined,
    'The document hook must not expose an installation marker');

  const otherFetch = async () => new Response('{}');
  const other = page('example.com', otherFetch);
  assert.equal(other.fetch, otherFetch, 'The page hook must not affect non-YouTube sites');
  const iframe = page('www.youtube.com', otherFetch, false);
  assert.equal(iframe.fetch, otherFetch, 'The hook must not run in a YouTube iframe');

  const activity = fs.readFileSync(activityPath, 'utf8');
  const helper = fs.readFileSync(helperPath, 'utf8');
  assert(activity.indexOf('new YamaBlockPageFilter(') < activity.indexOf('web.loadUrl(firstUrl)'),
    'Document-start registration must happen before the first URL load');
  assert(helper.includes('WebViewFeature.DOCUMENT_START_SCRIPT'));
  assert(helper.includes('WebViewCompat.addDocumentStartJavaScript('));
  assert(helper.includes('boolean update(boolean nextEnabled)'));
  assert(!helper.includes('disabledHostsJson'));
  assert(!helper.includes('__yamaBlockApply'));
  assert(activity.includes('refreshYamaBlockPageFilters();'));
  assert(activity.includes('isBlockerDisabledForHost(host)'));
  assert(activity.includes('if (changed && isYouTubeHost(hostForUrl(url))) tab.web.reload();'));
  assert(activity.includes('yamaBlockPageFilter.destroy();'));

  console.log('PASS: Android YamaBlock is installed before first load, prunes YouTube player ads, and keeps mode/exception state native-only.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
