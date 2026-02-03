import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Root endpoint - redirects to install page or shows status
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const installUrl = `https://slack.com/oauth/v2/authorize?client_id=8260956289187.10424448798805&scope=chat:write,commands,app_mentions:read,im:history&redirect_uri=https://allmediasync.vercel.app/api/oauth/callback`;

  res.status(200).send(`
    <html>
      <head>
        <title>All Media Sync</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 40px;
            max-width: 600px;
            margin: 0 auto;
            text-align: center;
          }
          h1 { color: #4A154B; }
          .btn {
            display: inline-block;
            background: #4A154B;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            margin: 20px 0;
          }
          .btn:hover { background: #611f69; }
          .status { 
            background: #f0f0f0; 
            padding: 20px; 
            border-radius: 8px; 
            text-align: left;
            margin: 20px 0;
          }
          .status h3 { margin-top: 0; }
        </style>
      </head>
      <body>
        <h1>📊 All Media Sync</h1>
        <p>Sync ClickUp tasks and Dropbox files to Slack</p>
        
        <a href="${installUrl}" class="btn">Add to Slack</a>
        
        <div class="status">
          <h3>Features</h3>
          <ul style="text-align: left;">
            <li>✅ Task completion notifications from ClickUp</li>
            <li>📁 File upload notifications from Dropbox</li>
            <li>📊 Project status commands in Slack</li>
          </ul>
        </div>
        
        <p><small>Commands: /mediaprojects, /mediastatus, /mediasync</small></p>
      </body>
    </html>
  `);
}
