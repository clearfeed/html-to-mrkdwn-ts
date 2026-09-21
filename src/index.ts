import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions, TranslatorConfigObject } from '@clearfeed-ai/node-html-markdown'
import { HTMLElement, Node, NodeType, TextNode, parse } from 'node-html-parser'
import baseTranslators from './translators'
import { findFirstImageSrc } from './utils'

const baseOptions: Partial<NodeHtmlMarkdownOptions> = {
  /**
   * Marker used by Slack mrkdwn for bullet lists.
   */
  bulletMarker: '•',
  /**
   * In Slack mrkdwn: {@link https://api.slack.com/reference/surfaces/formatting#basics}
   * - Bold text is represented by a single asterisk (*),
   *   deviating from the standard double asterisks (**) used in regular Markdown.
   * - Strikethrough is denoted by a single tilde (~),
   *   in contrast to the standard double tilde (~~) used in regular Markdown.
   */

  strongDelimiter: '*',
  strikeDelimiter: '~',
  globalEscape: [] as any,
  lineStartEscape: [] as any
}

/** Same settings node-html-markdown parses with, so both passes agree on what is text. */
const parserOptions = {
  lowerCaseTagName: false,
  comment: false,
  fixNestedATags: true,
  blockTextElements: { script: false, noscript: false, style: false }
}

/**
 * Slack syntax a producer wrote into a text node (Quill emits mentions this way) means
 * the real thing, so it passes through. Only these documented forms: anything else
 * shaped like `<!...>`, such as `<!DOCTYPE html>`, is text and gets escaped.
 *
 * Ids carry their type as a prefix - `U`/`W` for users, `C` for channels, `S` for user
 * groups - and slack-to-html resolves only those, so `<@ABC>` is author text. Its user
 * and channel patterns fall back to rendering whatever is inside as a name, so a loose
 * id here does not stay literal downstream; it renders as a mention.
 * {@link https://api.slack.com/reference/surfaces/formatting}
 */
const SLACK_ENTITY_PATTERN =
  '<(?:' +
  [
    '@[UW][A-Z0-9]+',
    '#C[A-Z0-9]+',
    '!subteam\\^S[A-Z0-9]+',
    '!(?:here|channel|everyone)',
    '!date\\^[0-9]+\\^[^|<>]*'
  ].join('|') +
  ')(?:\\|[^<>]*)?>'

const slackEntityOrSpecialCharacter = new RegExp(`${SLACK_ENTITY_PATTERN}|[&<>]`, 'g')
const specialCharacter = /[&<>]/g

const slackEscapeByCharacter: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
}

/** Code is quoted verbatim, so Slack syntax inside it is text and gets escaped too. */
const toSlackText = (text: string, literal: boolean): string =>
  text.replace(literal ? specialCharacter : slackEntityOrSpecialCharacter, (match) =>
    slackEscapeByCharacter[match] ?? match
  )

/**
 * node-html-markdown decodes text nodes once, so Slack's `&lt;` is stored as `&amp;lt;`
 * to survive that. `\u00a0` goes back to `&nbsp;` because the parser reads raw text when
 * deciding what is whitespace.
 */
const reparseEscapeByCharacter: Record<string, string> = {
  ...slackEscapeByCharacter,
  '\u00a0': '&nbsp;'
}

const encodeForReparse = (text: string): string =>
  text.replace(/[&<>\u00a0]/g, (character) => reparseEscapeByCharacter[character])

const LITERAL_TAGS = new Set(['CODE', 'PRE'])

const forEachTextNode = (
  node: Node,
  visit: (textNode: TextNode, literal: boolean) => void,
  literal = false
): void => {
  for (const child of node.childNodes) {
    if (child.nodeType === NodeType.TEXT_NODE) visit(child as TextNode, literal)
    else {
      const tagName = (child as HTMLElement).rawTagName
      forEachTextNode(child, visit, literal || LITERAL_TAGS.has(tagName?.toUpperCase()))
    }
  }
}

/**
 * The parser reports a doctype as text rather than a node, and node-html-markdown drops
 * it - escaping it would print it into the message instead. Anchored to the start of the
 * document, so `&lt;!DOCTYPE html&gt;` an author typed stays text.
 */
const LEADING_DOCTYPE = /^\s*<!DOCTYPE[^>]*>/i

/**
 * Runs before node-html-markdown because that decodes text nodes, leaving
 * `&lt;div&gt;` indistinguishable from a real tag; `textReplace` is no help either, since
 * `pre`/`code` use `noEscape` and never reach it. Letting the parser say what is text
 * keeps `href` values and the many spellings of `<` (`&#60;`, `&LT;`, ...) out of our
 * hands.
 */
const normalizeHtmlForSlack = (html: string): string => {
  const root = parse(html.replace(LEADING_DOCTYPE, ''), parserOptions)

  // `text` decodes; `rawText` is written back out verbatim.
  forEachTextNode(root, (textNode, literal) => {
    textNode.rawText = encodeForReparse(toSlackText(textNode.text, literal))
  })

  return root.toString()
}

const htmlToMrkdwn = (
  html: string,
  options: Partial<NodeHtmlMarkdownOptions> = {},
  translators: TranslatorConfigObject = {}
) => {
  const result = NodeHtmlMarkdown.translate(
    normalizeHtmlForSlack(html),
    { ...baseOptions, ...options },
    { ...baseTranslators, ...translators }
  );

  return {
    text: result,
    image: findFirstImageSrc(html)
  }
}

export default htmlToMrkdwn
