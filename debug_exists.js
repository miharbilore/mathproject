const fs = require('fs');
const path = require('path');

const target = 'Unit_1_Ratio_Rate_Percentage/Ratios_Proportions/json_files/test_1_Foundation_Jalapeno.json';
console.log(`Checking: ${target}`);
console.log(`Exists: ${fs.existsSync(target)}`);

if (fs.existsSync(target)) {
    console.log('Real path:', fs.realpathSync(target));
}
