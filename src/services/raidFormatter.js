const colorOrder = [
  "Red",
  "Orange",
  "Amber",
  "Gold",
  "Light Yellow",
  "Lime",
  "Green",
  "Light Green",
  "Cyan",
  "Light Blue",
  "Blue",
  "Purple",
  "Pink",
  "Magenta",
  "Brown",
  "Brick Red",
  "Gray"
];

const raidOrder = ["Serca", "Cathedral"];
const statusOrder = ["TODO", "DONE"];

function getOrderIndex(order, value) {
  const index = order.findIndex((item) => item.toLowerCase() === value.toLowerCase());
  return index === -1 ? order.length : index;
}

function sortRaidResults(results) {
  return [...results].sort((left, right) => {
    const statusComparison =
      getOrderIndex(statusOrder, left.status || "TODO") -
      getOrderIndex(statusOrder, right.status || "TODO");

    if (statusComparison !== 0) {
      return statusComparison;
    }

    const colorComparison =
      getOrderIndex(colorOrder, left.color) - getOrderIndex(colorOrder, right.color);

    if (colorComparison !== 0) {
      return colorComparison;
    }

    const raidComparison =
      getOrderIndex(raidOrder, left.name) - getOrderIndex(raidOrder, right.name);

    if (raidComparison !== 0) {
      return raidComparison;
    }

    return left.name.localeCompare(right.name);
  });
}

function formatGroupedRaidResults(results, getLine, options = {}) {
  const sortedResults = sortRaidResults(results);
  const lines = [];
  let previousColor = null;
  let previousStatus = null;

  for (const result of sortedResults) {
    const status = result.status || "TODO";

    if (options.showStatusHeaders && previousStatus !== status) {
      if (lines.length > 0) {
        lines.push("");
      }

      lines.push(`**${status}**`);
      previousColor = null;
    }

    if (previousColor && previousColor !== result.color) {
      lines.push("");
    }

    lines.push(getLine(result));
    previousColor = result.color;
    previousStatus = status;
  }

  return lines.join("\n");
}

function formatStatusGroupedRaidResults(results, getLine) {
  return formatGroupedRaidResults(results, getLine, { showStatusHeaders: true });
}

module.exports = {
  formatGroupedRaidResults,
  formatStatusGroupedRaidResults,
  sortRaidResults
};
