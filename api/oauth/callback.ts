import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * OAuth Callback Handler
 * 
 * Handles the redirect after Slack app installation.
 * Exchanges the code for an access token.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { code, error } = req.query;

  if (error) {
    res.status(400).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Installation Failed</h1>
          <p>Error: ${error}</p>
          <p><a href="https://api.slack.com/apps">Go back to Slack Apps</a></p>
        </body>
      </html>
    `);
    return;
  }

  if (code) {
    try {
      // Exchange code for access token
      const response = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.SLACK_CLIENT_ID || '8260956289187.10424448798805',
          client_secret: process.env.SLACK_CLIENT_SECRET || '',
          code: code as string,
          redirect_uri: 'https://allmediasync.vercel.app/api/oauth/callback',
        }),
      });

      const data = await response.json() as {
        ok: boolean;
        access_token?: string;
        team?: { name: string };
        error?: string;
      };

      if (data.ok) {
        res.status(200).send(`
          <html>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h1>✅ App Installed Successfully!</h1>
              <p>All Media Sync has been installed to <strong>${data.team?.name || 'your workspace'}</strong>.</p>
              <p style="background: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 600px;">
                <strong>Bot Token:</strong><br>
                <code style="word-break: break-all;">${data.access_token}</code>
              </p>
              <p>⚠️ Copy this token and add it to your Vercel environment variables as <code>SLACK_BOT_TOKEN</code></p>
              <p>Then <a href="https://vercel.com/dashboard">redeploy your app</a>.</p>
            </body>
          </html>
        `);
      } else {
        res.status(400).send(`
          <html>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h1>❌ Installation Failed</h1>
              <p>Error: ${data.error}</p>
              <p><a href="https://api.slack.com/apps">Go back to Slack Apps</a></p>
            </body>
          </html>
        `);
      }
    } catch (err) {
      res.status(500).send(`
        <html>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>❌ Server Error</h1>
            <p>${err}</p>
          </body>
        </html>
      `);
    }
  } else {
    res.status(400).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Missing Code</h1>
          <p>No authorization code received from Slack.</p>
        </body>
      </html>
    `);
  }
}
