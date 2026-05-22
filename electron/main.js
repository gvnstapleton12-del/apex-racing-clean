const { app, BrowserWindow } = require('electron')
const path = require('path')

let mainWindow

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a1518',
  })

  const isDev = process.env.NODE_ENV === 'development'
  mainWindow.loadURL(isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../dist/index.html')}`)

  if (!isDev) {
    mainWindow.removeMenu()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
