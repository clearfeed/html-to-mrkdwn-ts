import htmlToMrkdwn from '../src/index'

/**
 * Slack's API returns message text with `&`, `<` and `>` escaped, and consumers render
 * mrkdwn back to HTML assuming that. Text converted here must come out the same shape,
 * or a tag the author typed reaches the DOM as live markup.
 */
describe('entity escaping', () => {
  describe('author text', () => {
    it('escapes a tag the author typed', () => {
      expect(htmlToMrkdwn('<p>&lt;hello&gt; hii &lt;/hello&gt;</p>').text).toEqual(
        '&lt;hello&gt; hii &lt;/hello&gt;'
      )
    })

    it('escapes an ampersand', () => {
      expect(htmlToMrkdwn('<p>A &amp; B</p>').text).toEqual('A &amp; B')
    })

    it('escapes a tag inside a code block', () => {
      expect(htmlToMrkdwn('<pre><code>&lt;div class="x"&gt;</code></pre>').text).toEqual(
        '```\n&lt;div class="x"&gt;\n```'
      )
    })

    it('escapes markup that would otherwise execute', () => {
      expect(htmlToMrkdwn('<p>&lt;img src=x onerror=alert(1)&gt;</p>').text).toEqual(
        '&lt;img src=x onerror=alert(1)&gt;'
      )
    })
  })

  describe('generated markup is not escaped', () => {
    it('keeps a link usable', () => {
      expect(htmlToMrkdwn('<a href="https://x.com">docs</a>').text).toEqual(
        '<https://x.com|docs>'
      )
    })

    it('keeps an image usable', () => {
      expect(htmlToMrkdwn('<img src="https://x.com/a.png" alt="a" />').text).toEqual(
        '<https://x.com/a.png|a>'
      )
    })

    it('keeps a mention usable alongside escaped author text', () => {
      const html =
        '<p>&lt;hello&gt; cc <span>&lt;@U123&gt;</span> ' +
        '<a href="https://x.com">docs</a></p>'
      expect(htmlToMrkdwn(html).text).toEqual('&lt;hello&gt; cc <@U123> <https://x.com|docs>')
    })

    it('leaves an ordinary span to the default handling', () => {
      expect(htmlToMrkdwn('<p>a <span>b</span> c</p>').text).toEqual('a b c')
    })

    /**
     * Not every producer carries the tag on an element. `parseAndNormalizeQuillHtml`
     * writes it into a text node, where it arrives entity-escaped; escaping that one
     * level further would store a mention nobody is notified by.
     */
    it('keeps a mention a producer wrote into a text node', () => {
      expect(htmlToMrkdwn('<p>hey <span>&lt;@U123&gt;</span> look</p>').text).toEqual(
        'hey <@U123> look'
      )
    })

    it('keeps a channel mention written into a text node', () => {
      expect(htmlToMrkdwn('<p>see &lt;#C0123|general&gt;</p>').text).toEqual(
        'see <#C0123|general>'
      )
    })

    it('keeps a usergroup mention written into a text node', () => {
      expect(htmlToMrkdwn('<p>cc &lt;!subteam^S123&gt;</p>').text).toEqual('cc <!subteam^S123>')
    })

    it('keeps a broadcast command written into a text node', () => {
      expect(htmlToMrkdwn('<p>&lt;!here&gt; ping</p>').text).toEqual('<!here> ping')
    })

    it('keeps an enterprise grid user mention', () => {
      expect(htmlToMrkdwn('<p>cc &lt;@W0123&gt;</p>').text).toEqual('cc <@W0123>')
    })

    it('keeps a labelled mention written into a text node', () => {
      expect(htmlToMrkdwn('<p>cc &lt;@U123|ashish&gt;</p>').text).toEqual('cc <@U123|ashish>')
    })

    it('keeps a date written into a text node', () => {
      expect(
        htmlToMrkdwn('<p>&lt;!date^1392734382^{date_short}|Feb 18, 2014&gt;</p>').text
      ).toEqual('<!date^1392734382^{date_short}|Feb 18, 2014>')
    })
  })

  /**
   * Only the constructs Slack documents are passed through. Anything else shaped like a
   * Slack entity is author text: letting `<!...>` through unescaped put a declaration
   * back into the markup, where the converter dropped it as a tag.
   */
  describe('text that only looks like a Slack entity', () => {
    it('escapes a doctype declaration', () => {
      expect(htmlToMrkdwn('<p>&lt;!DOCTYPE html&gt;</p>').text).toEqual('&lt;!DOCTYPE html&gt;')
    })

    it('escapes an entity declaration', () => {
      expect(htmlToMrkdwn('<p>&lt;!ENTITY x SYSTEM "f"&gt;</p>').text).toEqual(
        '&lt;!ENTITY x SYSTEM "f"&gt;'
      )
    })

    it('escapes an unknown bang keyword', () => {
      expect(htmlToMrkdwn('<p>&lt;!notacommand&gt;</p>').text).toEqual('&lt;!notacommand&gt;')
    })

    it('escapes a mention whose id is not a Slack id', () => {
      expect(htmlToMrkdwn('<p>&lt;@not an id&gt;</p>').text).toEqual('&lt;@not an id&gt;')
    })

    /**
     * Ids carry their type as a prefix. slack-to-html falls back to rendering whatever
     * is inside `<@...>`/`<#...>` as a name, so a loose id left live renders as a
     * mention rather than as the text the author typed.
     */
    it('escapes a user mention without the U or W prefix', () => {
      expect(htmlToMrkdwn('<p>&lt;@ABC&gt;</p>').text).toEqual('&lt;@ABC&gt;')
    })

    it('escapes a channel reference without the C prefix', () => {
      expect(htmlToMrkdwn('<p>&lt;#GENERAL&gt;</p>').text).toEqual('&lt;#GENERAL&gt;')
    })

    it('escapes a user group without the S prefix', () => {
      expect(htmlToMrkdwn('<p>&lt;!subteam^ABC&gt;</p>').text).toEqual('&lt;!subteam^ABC&gt;')
    })

    it('escapes a channel reference without an id', () => {
      expect(htmlToMrkdwn('<p>&lt;#general&gt;</p>').text).toEqual('&lt;#general&gt;')
    })

    it('escapes the lookalike but keeps a real mention beside it', () => {
      expect(htmlToMrkdwn('<p>&lt;@U123&gt; and &lt;!DOCTYPE&gt;</p>').text).toEqual(
        '<@U123> and &lt;!DOCTYPE&gt;'
      )
    })

    /**
     * A document's own doctype is not text. Inbound email usually carries one, and
     * escaping it would print the declaration at the top of the message.
     */
    it('drops the doctype of an HTML document', () => {
      expect(htmlToMrkdwn('<!DOCTYPE html><html><body><p>hi</p></body></html>').text).toEqual(
        'hi'
      )
    })

    it('drops a transitional doctype', () => {
      const html =
        '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" ' +
        '"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html><body>' +
        '<p>hi</p></body></html>'
      expect(htmlToMrkdwn(html).text).toEqual('hi')
    })
  })

  /**
   * A `<`, `>` or `&` the author typed without escaping it is still one of the characters
   * Slack stores escaped, and the parser hands it over as text like any other.
   */
  describe('characters the author left unescaped', () => {
    it('escapes a bare angle bracket', () => {
      expect(htmlToMrkdwn('<p>a < b</p>').text).toEqual('a &lt; b')
    })

    it('escapes a bare ampersand', () => {
      expect(htmlToMrkdwn('<p>Q&A</p>').text).toEqual('Q&amp;A')
    })

    it('escapes a bare greater-than', () => {
      expect(htmlToMrkdwn('<p>5 > 3</p>').text).toEqual('5 &gt; 3')
    })
  })

  /**
   * The parser decodes with browser rules, so `&lt;` is only one of the spellings that
   * produces a `<`. Inbound email chooses its own encoding, so the uncommon forms reach
   * this package in practice.
   */
  describe('every spelling the parser decodes', () => {
    it('escapes decimal numeric angle-bracket entities', () => {
      expect(htmlToMrkdwn('<p>&#60;img src=x onerror=alert(1)&#62;</p>').text).toEqual(
        '&lt;img src=x onerror=alert(1)&gt;'
      )
    })

    it('escapes hexadecimal numeric angle-bracket entities', () => {
      expect(htmlToMrkdwn('<p>&#x3C;div&#x3E;</p>').text).toEqual('&lt;div&gt;')
    })

    it('escapes a numeric ampersand', () => {
      expect(htmlToMrkdwn('<p>A &#38; B</p>').text).toEqual('A &amp; B')
    })

    it('escapes upper case named entities', () => {
      expect(htmlToMrkdwn('<p>&LT;div&GT;</p>').text).toEqual('&lt;div&gt;')
    })

    it('escapes named entities written without a semicolon', () => {
      expect(htmlToMrkdwn('<p>&lt div &gt</p>').text).toEqual('&lt; div &gt;')
    })

    it('escapes a numeric entity inside a code block', () => {
      expect(htmlToMrkdwn('<pre><code>&#60;div&#62;</code></pre>').text).toEqual(
        '```\n&lt;div&gt;\n```'
      )
    })

    it('leaves a numeric entity for a harmless character alone', () => {
      expect(htmlToMrkdwn('<p>it&#39;s &quot;fine&quot;</p>').text).toEqual('it\'s "fine"')
    })

    it('does not change a numeric ampersand inside an href', () => {
      expect(htmlToMrkdwn('<a href="https://x.com?a=1&#38;b=2">d</a>').text).toEqual(
        '<https://x.com?a=1&b=2|d>'
      )
    })
  })

  /**
   * `&amp;` in a query string is ordinary HTML; escaping it a second level leaves the
   * translated link pointing somewhere else.
   */
  describe('attributes are left alone', () => {
    it('does not change an escaped ampersand in an href', () => {
      expect(htmlToMrkdwn('<a href="https://example.com?a=1&amp;b=2">link</a>').text).toEqual(
        '<https://example.com?a=1&b=2|link>'
      )
    })

    it('does not change escaped angle brackets in an href', () => {
      expect(htmlToMrkdwn('<a href="https://example.com?q=&lt;t&gt;">link</a>').text).toEqual(
        '<https://example.com?q=<t>|link>'
      )
    })

    it('does not change an escaped ampersand in an img src', () => {
      expect(htmlToMrkdwn('<img src="https://x.com/a.png?w=1&amp;h=2" alt="a" />').text).toEqual(
        '<https://x.com/a.png?w=1&h=2|a>'
      )
    })

    it('does not change entities in a title attribute', () => {
      expect(htmlToMrkdwn('<a href="https://x.com" title="A &amp; B">link</a>').text).toEqual(
        '<https://x.com "A & B"|link>'
      )
    })

    /** A `>` inside a quoted value must not end the tag early. */
    it('steps over a quoted attribute containing an angle bracket', () => {
      expect(htmlToMrkdwn('<a href="https://x.com" title="a &gt; b">link</a>').text).toEqual(
        '<https://x.com "a > b"|link>'
      )
    })

    it('escapes author text alongside an attribute it left alone', () => {
      expect(
        htmlToMrkdwn('<p>use &lt;div&gt; <a href="https://x.com?a=1&amp;b=2">docs</a></p>').text
      ).toEqual('use &lt;div&gt; <https://x.com?a=1&b=2|docs>')
    })

    it('leaves a comment out of the escaping', () => {
      expect(htmlToMrkdwn('<!-- a &amp; b --><p>&lt;i&gt;</p>').text).toEqual('&lt;i&gt;')
    })
  })

  /**
   * `pre`/`code` are translated with `noEscape`, which returns the text node before the
   * visitor reaches `textReplace`. Escaping the source HTML is what reaches them.
   */
  describe('code blocks reached despite noEscape', () => {
    const appServerTranslators = {
      pre: { noEscape: true, preserveWhitespace: true, surroundingNewlines: 1 }
    }

    it('escapes a tag in a code block under the app-server pre override', () => {
      expect(
        htmlToMrkdwn('<pre><code>&lt;div&gt;hello&lt;/div&gt;</code></pre>', {}, appServerTranslators)
          .text
      ).toEqual('```\n&lt;div&gt;hello&lt;/div&gt;\n```')
    })

    it('escapes a tag in an inline code span', () => {
      expect(htmlToMrkdwn('<p>use <code>&lt;div&gt;</code> here</p>').text).toEqual(
        'use `&lt;div&gt;` here'
      )
    })

    it('escapes an ampersand inside a code block', () => {
      expect(htmlToMrkdwn('<pre><code>a &amp;&amp; b</code></pre>').text).toEqual(
        '```\na &amp;&amp; b\n```'
      )
    })

    /**
     * Code is quoted verbatim, so Slack syntax inside it is text. slack-to-html resolves
     * mentions after expanding code blocks, so a live `<@U123>` here would be rendered
     * as a mention instead of as literal code.
     */
    it('escapes a mention inside a code block', () => {
      expect(htmlToMrkdwn('<pre><code>&lt;@U123&gt;</code></pre>').text).toEqual(
        '```\n&lt;@U123&gt;\n```'
      )
    })

    it('escapes a broadcast inside a code block', () => {
      expect(htmlToMrkdwn('<pre><code>&lt;!here&gt;</code></pre>').text).toEqual(
        '```\n&lt;!here&gt;\n```'
      )
    })

    it('escapes a channel mention inside an inline code span', () => {
      expect(htmlToMrkdwn('<code>&lt;#C123&gt;</code>').text).toEqual('`&lt;#C123&gt;`')
    })

    it('keeps a mention outside code live while escaping the one inside', () => {
      expect(htmlToMrkdwn('<p>cc &lt;@U1&gt; <code>&lt;@U2&gt;</code></p>').text).toEqual(
        'cc <@U1> `&lt;@U2&gt;`'
      )
    })

    it('preserves indentation inside a code block', () => {
      expect(
        htmlToMrkdwn('<pre><code>&lt;a&gt;\n    &lt;b&gt;x&lt;/b&gt;\n&lt;/a&gt;</code></pre>').text
      ).toEqual('```\n&lt;a&gt;\n    &lt;b&gt;x&lt;/b&gt;\n&lt;/a&gt;\n```')
    })
  })

  describe('shape parity with Slack', () => {
    it('produces what Slack would have stored for the same message', () => {
      // Slack escapes `<` and `>` in message text; this must match.
      expect(htmlToMrkdwn('<p>use &lt;div&gt; here</p>').text).toEqual('use &lt;div&gt; here')
    })

    it('keeps an entity the author typed literally', () => {
      // `&amp;lt;` is the author writing the characters `&lt;`, not a `<`.
      expect(htmlToMrkdwn('<p>&amp;lt;</p>').text).toEqual('&amp;lt;')
    })
  })
})
