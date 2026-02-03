import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(
  req: VercelRequest,
  res: VercelResponse
): void {
  const installUrl = 'https://slack.com/oauth/v2/authorize?client_id=8260956289187.10424448798805&scope=chat:write,commands,app_mentions:read,im:history&redirect_uri=https://allmediasync.vercel.app/api/oauth/callback';

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>All Media Sync</title>
</head>
<body style="font-family: sans-serif; padding: 40px; text-align: center;">
  <h1>All Media Sync</h1>
  <p>Sync ClickUp tasks and Dropbox files to Slack</p>
  <a href="${installUrl}" style="display: inline-block; background: #4A154B; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Add to Slack</a>
  <p style="margin-top: 40px;">Commands: /mediaprojects, /mediastatus, /mediasync</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}
