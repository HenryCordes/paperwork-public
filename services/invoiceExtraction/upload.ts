import multer from 'multer'

const scanUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type, only JPEG and PNG are allowed!'))
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
})

export = scanUpload
