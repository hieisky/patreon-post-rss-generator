export function prepareUrl(campaignId) {
    const apiUrl = new URL('https://www.patreon.com/api/posts');
    const params = {
        'fields[post]': 'content,created_at,published_at,title,url,teaser_text,image,thumbnail,thumbnail_url',
        'fields[user]': 'full_name,url',
        'fields[post_tag]': 'tag_type,value',
        'filter[campaign_id]': campaignId,
        'filter[is_draft]': 'false',
        'include': 'campaign',
        'sort': '-published_at',
        'json-api-version': '1.0'
    };
    
    Object.keys(params).forEach(key => 
        apiUrl.searchParams.append(key, params[key])
    );

    return apiUrl;
}

export async function fetchPatreonData(campaignId) {
    const apiUrl = prepareUrl(campaignId);
    const response = await fetch(apiUrl);

    if (!response.ok) {
        const errorText = await response.text();
        const responseHeadersString = JSON.stringify(Object.fromEntries([...response.headers]));
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}, headers: ${responseHeadersString}`);
    }

    return response.json();
}