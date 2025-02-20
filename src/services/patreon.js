export function prepareUrl(campaignId, userDefinedTags, mediaType) {
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
    
    if (userDefinedTags) {
        console.log('Filtering data by user_defined_tags:', userDefinedTags);
        params['filter[tag]'] = userDefinedTags;
    }

    if (mediaType) {
        console.log('Filtering data by media_types:', mediaType);
        params['filter[media_types]'] = mediaType
    }

    Object.keys(params).forEach(key => 
        apiUrl.searchParams.append(key, params[key])
    );

    return apiUrl;
}

export async function fetchPatreonData(campaignId, userDefinedTags, mediaType) {
    const apiUrl = prepareUrl(campaignId, userDefinedTags, mediaType);
    const response = await fetch(apiUrl, {
        headers: {
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept': 'application/vnd.api+json',
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        const responseHeadersString = JSON.stringify(Object.fromEntries([...response.headers]));
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}, headers: ${responseHeadersString}`);
    }

    return await response.json();
}