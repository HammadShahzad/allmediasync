import type { VercelRequest, VercelResponse } from '@vercel/node';

interface SlackOAuthResponse {
  ok: boolean;
  access_token?: string;
  team?: { name: string };
  error?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { code, error } = req.query;

  res.setHeader('Content-Type', 'text/html');

  if (error) {
    res.status(400).send(`<html><body><h1>Installation Failed</h1><p>Error: ${error}</p></body></html>`);
    return;
  }

  if (!code) {
    res.status(400).send(`<html><body><h1>Missing Code</h1><p>No authorization code received.</p></body></html>`);
    return;
  }

  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: '8260956289187.10424448798805',
        client_secret: process.env.SLACK_CLIENT_SECRET || '',
        code: code as string,
        redirect_uri: 'https://allmediasync.vercel.app/api/oauth/callback',
      }),
    });

    const data = await response.json() as SlackOAuthResponse;

    if (data.ok && data.access_token) {
      res.status(200).send(`<html><body style="font-family: sans-serif; padding: 40px;">
        <h1>App Installed Successfully!</h1>
        <p>Installed to: ${data.team?.name || 'your workspace'}</p>
        <p><strong>Bot Token:</strong></p>
        <textarea style="width: 100%; height: 100px;">${data.access_token}</textarea>
        <p>Copy this token and add it to Vercel as SLACK_BOT_TOKEN</p>
      </body></html>`);
    } else {
      res.status(400).send(`<html><body><h1>Installation Failed</h1><p>Error: ${data.error || 'Unknown error'}</p></body></html>`);
    }
  } catch (err) {
    res.status(500).send(`<html><body><h1>Server Error</h1><p>${String(err)}</p></body></html>`);
  }
}
