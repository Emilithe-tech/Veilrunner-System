/** Register helpers. */
export function registerHandlebarsHelpers() {
  Handlebars.registerHelper("array", (...args) => args.slice(0, -1));

  Handlebars.registerHelper("subtract", (a, b) => Math.max(0, (Number(a) || 0) - (Number(b) || 0)));

  Handlebars.registerHelper("percent", (value, max) => {
    if (!max) return 0;
    return Math.round((Number(value) / Number(max)) * 100);
  });

  Handlebars.registerHelper("lowercase", (str) => String(str ?? "").toLowerCase());

  Handlebars.registerHelper("concat", (...args) => args.slice(0, -1).join(""));

  Handlebars.registerHelper("eq", (a, b) => a === b);

  Handlebars.registerHelper("or", (...args) => {
    const values = args.slice(0, -1);
    return values.some(Boolean);
  });

  Handlebars.registerHelper("and", (...args) => {
    const values = args.slice(0, -1);
    return values.every(Boolean);
  });

  // Repeat n.
  Handlebars.registerHelper("times", function (n, options) {
    let out = "";
    for (let i = 0; i < n; i++) out += options.fn(i);
    return out;
  });
}
