// Netlify serverless function to proxy Roku API requests (handles CORS)
exports.handler = async (event, context) => {
    // Only allow from same origin in production
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Parse parameters
        const { ip, endpoint, method = 'GET' } = event.queryStringParameters || {};

        if (!ip || !endpoint) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing ip or endpoint parameter' }),
            };
        }

        // Validate IP format
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(ip)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid IP address format' }),
            };
        }

        // Make request to Roku (with minimal headers to avoid 403)
        const rokuUrl = `http://${ip}:8060${endpoint}`;
        const response = await fetch(rokuUrl, {
            method: method,
            headers: {
                'User-Agent': 'Roku-Control-App/1.0'
            },
        });

        const contentType = response.headers.get('content-type') || '';
        const body = await response.text();

        return {
            statusCode: response.status,
            headers: {
                ...headers,
                'Content-Type': contentType,
            },
            body: body,
        };
    } catch (error) {
        console.error('Proxy error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to connect to Roku',
                message: error.message,
            }),
        };
    }
};
