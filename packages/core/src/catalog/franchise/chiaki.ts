import * as cheerio from 'cheerio';

import { positiveInteger } from '../../utils';
import type { FranchiseOrder } from './schema';

export interface ChiakiEntry {
    malId: number;
    typeId: string;
    title: string;
    alternativeTitle: string;
    image: string;
    secondary: boolean;
}

function parseOrder(html: string) {
    const $ = cheerio.load(html);
    const types: FranchiseOrder['types'] = [];
    for (const label of $('#wo_type_filter label').toArray()) {
        const element = $(label);
        const id = element.find("input[type='checkbox']").first().attr('value')?.trim();
        const text = element.text().replace(/\s+/g, ' ').trim();
        if (id && text) {
            types.push({ id, label: text });
        }
    }

    const entries: ChiakiEntry[] = [];
    for (const row of $('#wo_list tr[data-id]').toArray()) {
        const element = $(row);
        // Chiaki stores artwork in an inline style, sometimes as a relative URL.
        const imagePath = element
            .find('.wo_avatar_big')
            .first()
            .attr('style')
            ?.match(/url\((['"]?)(.*?)\1\)/i)?.[2]
            ?.trim();
        const entry: ChiakiEntry = {
            malId: positiveInteger(element.attr('data-id')) ?? 0,
            typeId: element.attr('data-type')?.trim() ?? '',
            title: element.find('.wo_title').first().text().trim(),
            alternativeTitle: element.find('.uk-text-small').first().text().trim(),
            image: imagePath ? new URL(imagePath, 'https://chiaki.site').href : '',
            secondary: element.hasClass('wo_row_secondary'),
        };
        if (entry.malId && entry.typeId && entry.title && entry.image) {
            entries.push(entry);
        }
    }

    if (!types.length || !entries.length) {
        throw new Error('Chiaki watch-order markup was not found');
    }

    return {
        types,
        entries,
    };
}

export async function fetchOrder(malId: number) {
    const response = await fetch(`https://chiaki.site/?/tools/watch_order/id/${malId}`, {
        headers: {
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://chiaki.site/',
            'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
        throw new Error(`Chiaki returned ${response.status}`);
    }

    const html = await response.text();
    if (html.length > 2 * 1024 * 1024) {
        throw new Error('Chiaki response was unexpectedly large');
    }

    return parseOrder(html);
}
