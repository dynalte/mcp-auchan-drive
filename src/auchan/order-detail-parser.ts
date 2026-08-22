/**
 * Parse le HTML de GET /client/mes-commandes/{ref}/{num}.
 *
 * Auchan a fait évoluer le DOM des détails de commande en 2026. Le parseur
 * comprend la structure actuelle et conserve les sélecteurs historiques afin
 * de ne pas casser les pages encore servies par les anciens renderers CREST.
 */

import type { OrderDetail, OrderProduct } from '../types.js';
import { decode, parsePrice } from './html-utils.js';

export function parseOrderDetailPage(
  html: string,
  orderRef: string,
  orderNumber: string,
): OrderDetail {
  const legacy = parseLegacyMetadata(html);
  const currentStatus = extractClassText(html, 'a-simplifiedState__label');
  const currentPickupSlot = normalizePickupSlot(
    extractClassText(html, 'p-detail__deliveryDate'),
  );
  const currentStore = extractCurrentStore(html);
  const currentTotalFormatted = extractCurrentTotal(html);

  return {
    orderNumber,
    orderRef,
    storeName: currentStore.name || legacy.storeName,
    storeAddress: currentStore.address || legacy.storeAddress,
    status: currentStatus || legacy.status,
    pickupSlot: currentPickupSlot || legacy.pickupSlot,
    total: parsePrice(currentTotalFormatted || legacy.totalFormatted),
    totalFormatted: currentTotalFormatted || legacy.totalFormatted,
    products: mergeProducts(
      parseCurrentProducts(html),
      parseLegacyProducts(html),
    ),
  };
}

interface LegacyMetadata {
  status: string;
  pickupSlot?: string;
  storeName: string;
  storeAddress: string;
  totalFormatted: string;
}

function parseLegacyMetadata(html: string): LegacyMetadata {
  const statusActive = html.match(
    /o-orderStatus__step[^"']*(?:active|current)[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([^<]+)/i,
  ) ?? html.match(
    /aria-current=["'][^"']*["'][^>]*>[\s\S]*?<span[^>]*>([^<]+)/i,
  );
  const pickup = html.match(/Retrait pr[eé]vu\s+le\s*:\s*([^\n<]+)/i);
  const storeName = html.match(/m-storeInfo__name[^>]*>([^<]+)/i)
    ?? html.match(/class=["'][^"']*storeName[^"']*["'][^>]*>([^<]+)/i);
  const storeAddress = html.match(/m-storeInfo__address[^>]*>([\s\S]*?)<\/p>/i)
    ?? html.match(/class=["'][^"']*storeAddress[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div)>/i);
  const total = html.match(/m-orderSummary__totalPrice[^>]*>([^<]+)/i)
    ?? html.match(/orderTotal[^>]*>([^<]+)/i);

  return {
    status: statusActive ? cleanText(statusActive[1]) : extractLastLegacyStatus(html),
    pickupSlot: pickup ? cleanText(pickup[1]) : undefined,
    storeName: storeName ? cleanText(storeName[1]) : '',
    storeAddress: storeAddress ? cleanText(storeAddress[1]) : '',
    totalFormatted: total ? cleanText(total[1]) : '',
  };
}

function extractLastLegacyStatus(html: string): string {
  const pattern = /o-orderStatus__step[^>]*>[\s\S]*?<span[^>]*>([^<]+)/gi;
  let match: RegExpExecArray | null;
  let status = '';
  while ((match = pattern.exec(html)) !== null) {
    const value = cleanText(match[1]);
    if (value) status = value;
  }
  return status;
}

function normalizePickupSlot(value: string): string | undefined {
  const normalized = value
    .replace(/^Retrait pr[eé]vu\s+le\s*:\s*/i, '')
    .trim();
  return normalized || undefined;
}

function extractCurrentStore(html: string): { name: string; address: string } {
  const pattern =
    /<div[^>]*class=["'][^"']*\bp-detail__address(?=\s|["'])[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    if (!/<strong[^>]*>\s*Magasin\s*<\/strong>/i.test(match[1])) continue;
    const body = match[1]
      .replace(/<strong[^>]*>\s*Magasin\s*<\/strong>/i, '')
      .replace(
        /<a[^>]*class=["'][^"']*\bp-detail__storeLink\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
        '',
      );
    const lines = decode(body.replace(/<br\s*\/?\s*>/gi, '\n'))
      .replace(/<[^>]*>/g, ' ')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    return { name: lines[0] ?? '', address: lines.slice(1).join(', ') };
  }

  return { name: extractClassText(html, 'a-pointOfService__place'), address: '' };
}

function extractCurrentTotal(html: string): string {
  const receipt = html.match(
    /class=["'][^"']*\bm-receipt__total\b[^"']*["'][^>]*>[\s\S]*?class=["'][^"']*\bm-receipt__value\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i,
  );
  const detail = html.match(
    /class=["'][^"']*\bp-detail__totalAmount\b[^"']*["'][^>]*>[\s\S]*?class=["'][^"']*\ba-amount\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  );
  return cleanText(receipt?.[1] ?? detail?.[1] ?? '');
}

function parseCurrentProducts(html: string): OrderProduct[] {
  const categories = collectSections(
    html,
    /class=["'][^"']*\bo-products__category\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
  );
  if (categories.length === 0) return parseCurrentProductBlocks(html, '');

  return categories.flatMap((entry, index) => {
    const end = categories[index + 1]?.index ?? html.length;
    return parseCurrentProductBlocks(html.slice(entry.index, end), entry.category);
  });
}

function parseCurrentProductBlocks(html: string, category: string): OrderProduct[] {
  const starts = collectBlockStarts(
    html,
    /class=["'][^"']*\bo-products__line\b[^"']*["'][^>]*>/gi,
  );

  return starts.flatMap((start, index) => {
    const block = html.slice(start, starts[index + 1] ?? html.length);
    const description = block.match(
      /class=["'][^"']*\bproduct-thumbnail__description\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
    )?.[1] ?? '';
    const brand = cleanText(
      description.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] ?? '',
    );
    const name = cleanText(
      description.replace(/<strong[^>]*>[\s\S]*?<\/strong>/i, ''),
    );
    if (!name) return [];

    const quantityText = extractClassText(block, 'p-detail__productQuantity');
    const quantity = Number.parseInt(quantityText.match(/(\d+)/)?.[1] ?? '1', 10);
    const priceFormatted = extractClassText(block, 'a-amount__amount');

    return [{
      name,
      brand,
      quantity,
      price: parsePrice(priceFormatted),
      priceFormatted,
      category,
    }];
  });
}

function parseLegacyProducts(html: string): OrderProduct[] {
  const categories = collectSections(
    html,
    /class=["'][^"']*m-orderProductList__categoryTitle[^"']*["'][^>]*>([^<]+)/gi,
  );
  if (categories.length === 0) return parseLegacyProductBlocks(html, '');

  return categories.flatMap((entry, index) => {
    const end = categories[index + 1]?.index ?? html.length;
    return parseLegacyProductBlocks(html.slice(entry.index, end), entry.category);
  });
}

function parseLegacyProductBlocks(html: string, category: string): OrderProduct[] {
  const starts = collectBlockStarts(
    html,
    /class=["'][^"']*m-orderProduct(?=["'\s])[^"']*["'][^>]*>/gi,
  );

  return starts.flatMap((start, index) => {
    const block = html.slice(start, starts[index + 1] ?? html.length);
    const description = block.match(
      /m-orderProduct__name[^>]*>([\s\S]*?)<\/p>/i,
    )?.[1] ?? '';
    const brand = cleanText(
      description.match(/<strong[^>]*>\s*([^<]+)\s*<\/strong>/i)?.[1] ?? '',
    );
    const name = cleanText(
      description.replace(/<strong[^>]*>[\s\S]*?<\/strong>/gi, ''),
    );
    if (!name) return [];

    const quantityMatch = block.match(/(?:Quantit[eé]\s*:\s*|[×x]\s*)(\d+)/i)
      ?? block.match(/m-orderProduct__quantity[^>]*>[^<]*?(\d+)/i);
    const quantity = Number.parseInt(quantityMatch?.[1] ?? '1', 10);
    const priceFormatted = cleanText(
      block.match(/m-orderProduct__price[^>]*>([^<]+)/i)?.[1] ?? '',
    );

    return [{
      name,
      brand,
      quantity,
      price: parsePrice(priceFormatted),
      priceFormatted,
      category,
    }];
  });
}

function mergeProducts(current: OrderProduct[], legacy: OrderProduct[]): OrderProduct[] {
  const products = new Map<string, OrderProduct>();
  for (const product of [...current, ...legacy]) {
    const key = [product.name, product.brand, product.category]
      .map((value) => value.toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim())
      .join('|');
    if (!products.has(key)) products.set(key, product);
  }
  return [...products.values()];
}

function collectSections(
  html: string,
  pattern: RegExp,
): Array<{ index: number; category: string }> {
  const sections: Array<{ index: number; category: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    sections.push({ index: match.index, category: cleanText(match[1]) });
  }
  return sections;
}

function collectBlockStarts(html: string, pattern: RegExp): number[] {
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) starts.push(match.index);
  return starts;
}

function extractClassText(html: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/(?:div|span|p|strong)>`,
    'i',
  );
  const match = html.match(pattern);
  return match ? cleanText(match[1]) : '';
}

function cleanText(value: string): string {
  return decode(
    value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
  );
}
