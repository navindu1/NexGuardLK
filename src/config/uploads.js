const multer = require('multer');
const path = require('path');

// Memory එකේ තියාගන්නවා (Supabase එකට යවන නිසා)
const storage = multer.memoryStorage();

// File එකේ වර්ගය (Extension) සහ Mimetype එක චෙක් කරනවා
const fileFilter = (req, file, cb) => {
    // පින්තූර (jpeg, jpg, png, webp) සහ PDF වලට විතරක් ඉඩ දෙනවා
    const allowedTypes = /jpeg|jpg|png|webp|pdf/;
    
    // File එකේ නමේ අන්තිම කෑල්ල (extension) චෙක් කරනවා
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    // File එකේ ඇත්ත වර්ගය (mimetype) චෙක් කරනවා
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        // වෙනත් භයානක ෆයිල්ස් (උදා: .php, .exe, .js) කෙලින්ම Reject කරනවා!
        cb(new Error("Security Alert: Only image files (JPG, PNG) and PDFs are allowed!"), false);
    }
};

// Multer එකට සෙට් කරනවා
const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 5 * 1024 * 1024 // උපරිම File Size එක 5MB
    },
    fileFilter: fileFilter
});

module.exports = upload;