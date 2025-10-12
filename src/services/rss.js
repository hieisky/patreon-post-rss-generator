export function generateRSS(data) {
    const posts = data.data || [];
    const campaignInfo = data.included[0].attributes;
    
    return `<?xml version="1.0" encoding="UTF-8" ?>
    <rss version="2.0">
        <channel>
            <title>${campaignInfo.name}</title>
            <link>${campaignInfo.url}</link>
            <description><![CDATA[${campaignInfo.summary}]]></description>
            ${posts.length ? `<lastBuildDate>${new Date(posts[0].attributes.published_at).toUTCString()}</lastBuildDate>` : ''}
            ${campaignInfo.avatar_photo_url ? `
            <image>
                <url>${escapeXml(campaignInfo.avatar_photo_url)}</url>
                <title>${campaignInfo.name}</title>
                <link>${campaignInfo.url}</link>
            </image>
            ` : ''}
            ${posts.map(post => `
            <item>
                <title>${escapeXml(post.attributes.title || '')}</title>
                <link>${escapeXml(post.attributes.url || '')}</link>
                <description><![CDATA[
                    ${post.attributes.image?.thumb_url ? `<img src="${post.attributes.image.thumb_url}" /><br />` : ''}
                    ${post.attributes.content ?? post.attributes.teaser_text ?? post.attributes.content_teaser_text}
                    <a href="${escapeXml(post.attributes.url)}">View in Patreon</a>
                ]]></description>
                <pubDate>${new Date(post.attributes.published_at).toUTCString()}</pubDate>
            </item>
            `).join('')}
        </channel>
    </rss>`;
}

export function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, c => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;'
    }[c]));
}