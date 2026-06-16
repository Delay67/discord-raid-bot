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
  "Purple",
  "Pink",
  "Magenta",
  "Brown",
  "Gray"
];

const raidOrder = ["Serca", "Cathedral"];

function getOrderIndex(order, value) {
  const index = order.findIndex((item) => item.toLowerCase() === value.toLowerCase());
  return index === -1 ? order.length : index;
}

function sortRaidResults(results) {
  return [...results].sort((left, right) => {
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

function formatGroupedRaidResults(results, getLine) {
  const sortedResults = sortRaidResults(results);
  const lines = [];
  let previousColor = null;

  for (const result of sortedResults) {
    if (previousColor && previousColor !== result.color) {
      lines.push("");
    }

    lines.push(getLine(result));
    previousColor = result.color;
  }

  return lines.join("\n");
}

module.exports = {
  formatGroupedRaidResults,
  sortRaidResults
};
