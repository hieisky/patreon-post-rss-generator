import { fetchPatreonData } from '../services/patreon.js';
import { generateRSS } from '../services/rss.js';

export default {
    async fetch(request, env) {
        try {
            console.log('Request URL:', request.url);
            console.log('Incoming request headers:', request.headers.get('user-agent'));
            console.log('Incoming request cf-connection-ip:', request.headers.get('cf-connecting-ip'));

            const url = new URL(request.url);
            const campaignId = url.searchParams.get('campaign_id');

            if (!campaignId) {
                return new Response('Campaign ID is required in query string', {
                    status: 400,
                    headers: { 
                        'Content-Type': 'text/plain',
                        'Cache-Control': 'max-age=60' 
                    }
                });
            }

            const data = await fetchPatreonData(campaignId);
            const rss = generateRSS(data);

            return new Response(rss, {
                headers: {
                    'Content-Type': 'application/xml',
                    'Cache-Control': 'max-age=1800'
                }
            });
        } catch (error) {
            console.error('Full error details:', {
                message: error.message,
                stack: error.stack,
                url: request.url,
                userAgent: request.headers.get('user-agent'),
                botCategory: request.cf?.verifiedBotCategory,
                time: new Date().toISOString()
            });

            return new Response(`Error: ${error.message}`, {
                status: 500,
                headers: { 
                    'Content-Type': 'text/plain',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Cache-Control': 'no-store'
                }
            });
        }
    }
};
