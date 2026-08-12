export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const query = String(body.query || "").trim();

    if (!query) {
      return Response.json(
        { error: "Please enter a search question." },
        { status: 400 }
      );
    }

    // Search the public web
    const searchUrl =
      "https://html.duckduckgo.com/html/?q=" +
      encodeURIComponent(query);

    const searchResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 SaintLohkiTV/1.0"
      }
    });

    const html = await searchResponse.text();

    // Extract search-result links and titles
    const results = [];
    const regex =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while ((match = regex.exec(html)) && results.length < 5) {
      const url = match[1];
      const title = match[2]
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .trim();

      if (url && title) {
        results.push({ title, url });
      }
    }

    if (!results.length) {
      return Response.json({
        answer:
          "I couldn't find useful web results for that search. Please try another question.",
        sources: []
      });
    }

    // Use Cloudflare Workers AI if the AI binding has been connected.
    if (context.env.AI) {
      const sourceText = results
        .map((r, i) => `${i + 1}. ${r.title}\n${r.url}`)
        .join("\n\n");

      const prompt = `You are SaintLohki's TV AI Navigator.

The visitor asked:
"${query}"

Here are current web search results:

${sourceText}

Give the visitor a useful, neutral answer based ONLY on the information available from these results.

Do not invent facts.
Clearly mention uncertainty when the sources don't provide enough information.
Keep the answer concise and easy to read.
Do not claim SaintLohki's TV reported anything.

Answer the visitor directly.`;

      const aiResult = await context.env.AI.run(
        "@cf/meta/llama-3.2-3b-instruct",
        { prompt }
      );

      return Response.json({
        answer:
          aiResult.response ||
          "I found some results, but I couldn't generate a summary.",
        sources: results
      });
    }

    // Fallback if AI binding hasn't been connected yet.
    return Response.json({
      answer:
        "I found these results on the web. AI summarization is being connected.",
      sources: results
    });
  } catch (error) {
    return Response.json(
      {
        error: "AI search failed.",
        details: error.message
      },
      { status: 500 }
    );
  }
}
