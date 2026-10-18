// Banks that use OAuth send the organizer back here (the redirect URI saved in Plaid). Plaid Link has to
// resume on this exact URL with the same link token, so this returns a tiny page instead of JSON.
// The token was saved in localStorage by the account page before Link opened.
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Linking your bank | Splits</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F6FB;color:#0B1020;font:17px/1.6 system-ui,sans-serif;text-align:center}
p{max-width:34ch;padding:0 24px}
</style>
</head>
<body>
<p id="status">Finishing up with your bank…</p>
<script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
<script>
(function () {
  var status = document.getElementById("status");
  var token = null;
  try { token = localStorage.getItem("splits-plaid-link-token"); } catch (e) {}
  if (!token || !window.Plaid) {
    status.textContent = "This bank link expired. Go back to your account and try again.";
    setTimeout(function () { location.replace("/account?bank=expired"); }, 2500);
    return;
  }
  var handler = window.Plaid.create({
    token: token,
    receivedRedirectUri: window.location.href,
    onSuccess: function (publicToken, metadata) {
      status.textContent = "Saving your bank…";
      var account = metadata && metadata.accounts && metadata.accounts[0];
      fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken: publicToken, accountId: account ? account.id : "" })
      }).then(function (res) {
        return res.json().then(function (result) { return { status: res.status, result: result }; });
      }).then(function (reply) {
        try { localStorage.removeItem("splits-plaid-link-token"); } catch (e) {}
        var result = reply.result;
        var outcome = result && result.ok ? (result.attached ? "linked" : "recorded") : reply.status === 409 ? "managed" : "failed";
        location.replace("/account?bank=" + outcome);
      }).catch(function () { location.replace("/account?bank=failed"); });
    },
    onExit: function () { location.replace("/account?bank=canceled"); }
  });
  handler.open();
})();
</script>
</body>
</html>`;

export function GET() {
  return new Response(page, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
