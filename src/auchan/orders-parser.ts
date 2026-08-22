/**
 * orders-parser.ts — Parse le HTML de GET /client/mes-commandes
 * Même approche que loyalty-parser.ts : regex sur le HTML brut, pas de cheerio/jsdom.
 */

import type { Order } from '../types.js';
import { decode, parsePrice } from './html-utils.js';

export type { Order };

/**
 * Parse la page HTML de l'historique des commandes et retourne la liste des commandes.
 *
 * Structure HTML attendue :
 * ```html
 * <li>
 *   <span>Drive</span>
 *   <span>Auchan Drive Caluire</span>
 *   <span>Commande n° 370069704 du 14 juin 2026</span>
 *   <span>Enregistrée</span>
 *   <span>14 Produits</span>
 *   <span>38,62 €</span>
 *   <a href="/client/mes-commandes/AROM-761999631/370069704">Modifier / Annuler...</a>
 * </li>
 * ```
 */
export function parseOrdersPage(html: string): Order[] {
  const orders: Order[] = [];

  // Extrait chaque bloc <li> contenant un lien vers /client/mes-commandes/
  const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/g;

  let liMatch: RegExpExecArray | null;
  while ((liMatch = liPattern.exec(html)) !== null) {
    const block = liMatch[1];

    // Le bloc doit contenir un lien vers une commande
    const hrefM = block.match(/href="(\/client\/mes-commandes\/([^/]+)\/(\d+))"/);
    if (!hrefM) continue;

    const detailUrl = hrefM[1];
    const orderRef = hrefM[2];
    const orderNumber = hrefM[3];

    // Structure actuelle (2026) : valeurs identifiées par classes CSS.
    // Le fallback historique fondé sur l'ordre des <span> reste disponible.
    const currentStoreName = extractClassText(block, 'a-pointOfService__place');
    const currentReference = extractClassText(block, 'p-order__reference');
    const currentStatus = extractClassText(block, 'a-simplifiedState__label');
    const currentProductCount = extractClassText(block, 'm-productThumbnails__count');
    const currentTotal = extractClassText(block, 'p-order__totalAmount');

    if (currentReference || currentStoreName || currentStatus || currentTotal) {
      const date = extractOrderDate(currentReference);
      const productCountM = currentProductCount.match(/(\d+)/);
      const productCount = productCountM ? parseInt(productCountM[1], 10) : 0;

      orders.push({
        orderRef,
        orderNumber,
        date,
        storeName: currentStoreName,
        status: currentStatus,
        productCount,
        total: parseOrderPrice(currentTotal),
        totalFormatted: currentTotal,
        detailUrl,
      });
      continue;
    }

    // Ancienne structure : extrait tous les <span>...</span> du bloc.
    const spans: string[] = [];
    const spanPattern = /<span[^>]*>([^<]*)<\/span>/g;
    let spanMatch: RegExpExecArray | null;
    while ((spanMatch = spanPattern.exec(block)) !== null) {
      const text = spanMatch[1].trim();
      if (text) spans.push(text);
    }

    // spans[0] = type (ex: "Drive")
    // spans[1] = nom du magasin (ex: "Auchan Drive Caluire")
    // spans[2] = "Commande n° XXXXXX du JJ mois AAAA"
    // spans[3] = statut (ex: "Enregistrée")
    // spans[4] = nombre de produits (ex: "14 Produits")
    // spans[5] = total (ex: "38,62 €")

    if (spans.length < 6) continue;

    const storeName = spans[1] ?? '';

    // Parse "Commande n° 370069704 du 14 juin 2026"
    const orderInfoM = spans[2]?.match(/Commande n°\s*\d+\s+du\s+(.+)/);
    const date = orderInfoM?.[1]?.trim() ?? '';

    const status = spans[3] ?? '';

    // Parse "14 Produits" → 14
    const productCountM = spans[4]?.match(/^(\d+)/);
    const productCount = productCountM ? parseInt(productCountM[1], 10) : 0;

    const totalFormatted = spans[5] ?? '';
    const total = parseOrderPrice(totalFormatted);

    orders.push({
      orderRef,
      orderNumber,
      date,
      storeName,
      status,
      productCount,
      total,
      totalFormatted,
      detailUrl,
    });
  }

  return orders;
}

/** Extrait et nettoie le texte d'un élément portant une classe CSS donnée. */
function extractClassText(block: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<([a-z][a-z0-9]*)[^>]*class=["'][^"']*\\b${escaped}(?=\\s|["'])[^"']*["'][^>]*>` +
      `([\\s\\S]*?)<\\/\\1>`,
    'i',
  );
  const match = block.match(pattern);
  if (!match) return '';

  return decode(match[2])
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Accepte "Commande n° ... du ..." ainsi que "Commande ... - ...". */
function extractOrderDate(reference: string): string {
  const match = reference.match(/(?:du|[-–—])\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

/** Convertit "38,62 €" → centimes entiers (3862). */
function parseOrderPrice(text: string): number {
  return parsePrice(text);
}
