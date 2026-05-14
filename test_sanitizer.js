const sanitizeFolderName = (name) => {
  const cleanName = name.replace(/[\u{1F300}-\u{1F6FF}]/gu, '').trim();
  return cleanName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
};

console.log('Unit 1:', sanitizeFolderName('📘 Unit 1: Ratio, Rate, Percentage'));
console.log('Ratios:', sanitizeFolderName('Ratios & Proportions'));
