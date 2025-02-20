import { fetchPatreonData } from '../services/patreon.js';
import { generateRSS } from '../services/rss.js';

export const handler = async (event, context) => {
    try {
        const campaignId = event.queryStringParameters?.campaign_id;
        const userDefinedTags = event.queryStringParameters?.user_defined_tags;
        const mediaType = event.queryStringParameters?.media_type;

        if (!campaignId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'text/plain',
                    'Cache-Control': 'max-age=60'
                },
                body: 'Campaign ID is required in query string'
            };
        }

        const data = await fetchPatreonData(campaignId, userDefinedTags, mediaType);
        const rss = generateRSS(data);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/xml',
                'Cache-Control': 'max-age=1800'
            },
            body: rss
        };
    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            event: event,
            time: new Date().toISOString()
        });

        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'text/plain',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Cache-Control': 'no-store'
            },
            body: `Error: ${error.message}`
        };
    }
};

export default handler;