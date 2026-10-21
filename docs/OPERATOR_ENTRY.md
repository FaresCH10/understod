# Standalone Operator Entry

2026-10-15. Overall71%,dedicated operator isolation75% (was70%),not production
ready. This closes the local default-entry defect,not actual hosted acceptance.

## Runtime

The optimized build now has separate index.html and operator.html inputs.
src/operator-entry.tsx renders Operations directly;it does not import the customer
App,customer session bootstrap or PWA registration. The operator brand returns
to /;the customer-only Back to Understood hash link is absent on this entry.
The existing local/customer #operations route keeps its previous behavior.

Verified operator startup calls loadOperatorBuild,not the customer static loader.
It requires .vite/manifest.json and an explicit operator.html entry,then follows
only its static/dynamic dependencies and their JS/CSS. Missing dependencies,
other HTML entries,escaping/unsupported assets,oversized/malformed manifests and
manifest paths resolved outside the build fail before serving. Each selected
file must resolve inside the build and be a regular file. No operator credentials
or runtime configuration is embedded in HTML or JavaScript.

On the operator origin, /,/index.html and /operator.html serve the standalone
entry with no-store. Only its asset graph and favicon are public. Customer entry
JS,the service worker,PWA manifest,CSV template,product image,source/maps/private
files and the build manifest itself return404. Hashed graph assets retain ETags,
immutable caching and correct MIME/HEAD/conditional behavior. CSP worker-src is
none;microphone,camera and geolocation permissions are disabled. Existing separate
origin,verified operator SQL profile,host-only cookie and customer API denial
remain unchanged. Customer runtime still uses its own public loader and PWA.

Old dist directories without the explicit operator entry/manifest now fail
operator startup closed. Rebuild before an authorized rollout;do not use the
customer loader as a fallback. No existing preview/build was replaced here.

## Local Evidence

- Final focused operator-build/clean-snapshot checks:13pass/zero fail/zero skips,
  311.0966ms. Initial file-symlink test could not run without Windows privileges;
  it was replaced with a real directory-junction escape test,which passed.
- Fresh offline install/build and full tests in isolated run
  0dbcbc34-02dd-4eb9-b49b-6bc76d6960e2:1118tests/1114pass/zero fail/four native
  prerequisite skips,263129.361ms. Real restricted operator startup verifies
  standalone root,headers,own entry JS,customer JS/PWA denial and existing login/
  session-context/logout controls.43mocked contract checks passed.
- A continuation removed the verifier/child terminal handles during the final
  pipeline step. OS inspection found no matching processes;the pipeline report
  was absent. The original running journal/log are retained,not relabeled pass.
  resumption.json records the separately completed pipeline:ten checks,24scripted
  provider requests,zero external requests,exit0 at19:01:36UTC. Before/after
  source comparison confirms all818files match the original snapshot SHA256
  436b45941de6eca40be774a2a9d58e687ff7eda324a556ee222e3fb07a99b9d2.
  This is composite unchanged-source evidence,not an uninterrupted verifier pass.

## Rendered Checks

The explicit --confirm-local-operator-ui fixture uses an in-memory PGlite schema,
the actual operator ACL profile and optimized build on loopback3194. It contains
only a fixed synthetic operator/tenant,no cloud keys,AI,mail,private storage or
worker loop. Its local HTTP cookie/transport is intentionally not hosted TLS,
proxy,host-prefix-cookie or independent native LOGIN proof.

Supported Cua checks observed root operator login without a hash/customer login,
keyboard sign-in,readiness,provider-disabled states,brand/root reload retaining
operator session,and keyboard sign-out returning to operator login. The320px and
1440px views have no page horizontal overflow. Screenshots are in
artifacts/operator-entry-*-2026-10-15.jpg;the first desktop capture was unsettled,
and the later desktop-settled capture is the accepted desktop observation.

The request-only fixture log showed zero customer API calls,two operator session
GETs,one login,one logout,two overview GETs and one provider GET. Four /sw.js GETs
were also seen,including one explicit diagnostic probe. They return404;the
operator HTML and actual four-file JS graph contain no serviceWorker,
registerPublicShell,/sw.js or /api/session bootstrap. The origin/browser reason
for the unsolicited GETs was not established. Do not claim zero SW requests or
proof that a previously registered worker was cleared. Fresh-host/legacy-worker
and actual deployment acceptance remain open. No external Reticle diagnostics
or Reticle verdict is claimed.

Owned browser tab closed,viewport reset. After the continuation,the fixture
process/handle was absent and OS inspection found no3194listener. Do not claim
an observed graceful shutdown. Original data and3020/3021previews were untouched.

## Next Gates

- [ ] Worker-dispatched provider verification without credentials in operators.
- [ ] Native88/three-role workflow/admission/fencing/cleanup evidence.
- [ ] Actual host/proxy/TLS/host-cookie/fresh-origin and prior-worker behavior,
  shutdown,rolling assets and deployment isolation.
- [ ] Broader operator authority/concurrency/device/reference/accessibility,
  privacy,backup,independent languages/live quality and release acceptance.
