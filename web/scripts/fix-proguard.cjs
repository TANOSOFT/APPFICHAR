const fs = require('fs');
const path = require('path');

const plugins = ['local-notifications', 'push-notifications', 'splash-screen'];

plugins.forEach(plugin => {
    const filePath = path.join(__dirname, '..', 'node_modules', '@capacitor', plugin, 'android', 'build.gradle');

    if (fs.existsSync(filePath)) {
        try {
            let content = fs.readFileSync(filePath, 'utf8');
            if (content.includes('proguard-android.txt')) {
                console.log(`Fixing ProGuard in @capacitor/${plugin}...`);
                content = content.replace(/proguard-android\.txt/g, 'proguard-android-optimize.txt');
                fs.writeFileSync(filePath, content, 'utf8');
            }
        } catch (err) {
            console.error(`Error fixing ${plugin}:`, err.message);
        }
    }
});
