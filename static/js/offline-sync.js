// Offline Data Sync Manager
class OfflineSyncManager {
  constructor() {
    this.dbName = "NZCActivatorOffline"
    this.version = 1
    this.db = null
    this.isOnline = navigator.onLine
    this.syncQueue = []
    this.initialized = false
    this.initPromise = null
    this.initError = null

    // Start initialization immediately
    this.initPromise = this.init()
  }

  async init() {
    try {
      console.log("Initializing offline sync manager...")

      // Check if IndexedDB is supported
      if (!window.indexedDB) {
        throw new Error("IndexedDB not supported in this browser")
      }

      await this.initIndexedDB()
      console.log("IndexedDB initialized successfully")

      this.setupEventListeners()
      this.startPeriodicSync()
      this.initialized = true
      this.initError = null

      // Check for pending syncs on startup
      if (this.isOnline) {
        setTimeout(() => this.syncPendingData(), 1000)
      }

      console.log("✅ Offline sync manager initialized successfully")

      // Update UI
      this.updateConnectionStatus()

      return true
    } catch (error) {
      console.error("❌ Failed to initialize offline sync manager:", error)
      this.initialized = false
      this.initError = error

      // Still update connection status to show we're online but without offline support
      this.updateConnectionStatus()

      throw error
    }
  }

  // Check if offline sync is ready and working
  isReady() {
    return this.initialized && this.db !== null
  }

  // Get initialization error if any
  getInitError() {
    return this.initError
  }

  // Add a method to ensure initialization is complete
  async ensureInitialized() {
    if (this.initPromise) {
      try {
        await this.initPromise
      } catch (error) {
        // Initialization failed, but we can still continue
        console.warn("Offline sync initialization failed:", error)
        return false
      }
    }
    return this.initialized
  }

  // Initialize IndexedDB for offline storage
  async initIndexedDB() {
    return new Promise((resolve, reject) => {
      console.log("Opening IndexedDB...")

      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => {
        const error = new Error("Failed to open IndexedDB: " + (request.error?.message || "Unknown error"))
        console.error("IndexedDB open error:", error)
        reject(error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log("IndexedDB opened successfully")

        // Test that we can actually use the database
        this.testDatabase()
          .then(() => {
            console.log("Database test successful")
            resolve()
          })
          .catch((testError) => {
            console.error("Database test failed:", testError)
            reject(new Error("Database test failed: " + testError.message))
          })
      }

      request.onupgradeneeded = (event) => {
        console.log("Upgrading IndexedDB schema...")
        const db = event.target.result

        try {
          // Store for offline sessions
          if (!db.objectStoreNames.contains("sessions")) {
            const sessionStore = db.createObjectStore("sessions", {
              keyPath: "tempId",
              autoIncrement: true,
            })
            sessionStore.createIndex("timestamp", "timestamp", { unique: false })
            sessionStore.createIndex("synced", "synced", { unique: false })
            console.log("Created sessions store")
          }

          // Store for offline photos
          if (!db.objectStoreNames.contains("photos")) {
            const photoStore = db.createObjectStore("photos", {
              keyPath: "tempId",
              autoIncrement: true,
            })
            photoStore.createIndex("sessionTempId", "sessionTempId", { unique: false })
            photoStore.createIndex("synced", "synced", { unique: false })
            console.log("Created photos store")
          }

          // Store for sync queue
          if (!db.objectStoreNames.contains("syncQueue")) {
            db.createObjectStore("syncQueue", {
              keyPath: "id",
              autoIncrement: true,
            })
            console.log("Created syncQueue store")
          }

          console.log("Database schema upgrade completed")
        } catch (schemaError) {
          console.error("Schema upgrade error:", schemaError)
          throw schemaError
        }
      }

      request.onblocked = () => {
        console.warn("IndexedDB upgrade blocked - another tab may be open")
        reject(new Error("Database upgrade blocked. Please close other tabs and try again."))
      }
    })
  }

  // Test database functionality
  async testDatabase() {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(["sessions"], "readwrite")
        const store = transaction.objectStore("sessions")

        // Try to perform a simple operation
        const testData = {
          test: true,
          timestamp: new Date().toISOString(),
          synced: true,
        }

        const request = store.add(testData)

        request.onsuccess = () => {
          // Clean up test data
          const deleteRequest = store.delete(request.result)
          deleteRequest.onsuccess = () => resolve()
          deleteRequest.onerror = () => resolve() // Don't fail if cleanup fails
        }

        request.onerror = () => {
          reject(new Error("Database write test failed: " + request.error?.message))
        }

        transaction.onerror = () => {
          reject(new Error("Database transaction failed: " + transaction.error?.message))
        }
      } catch (error) {
        reject(new Error("Database test setup failed: " + error.message))
      }
    })
  }

  // Setup event listeners for online/offline status
  setupEventListeners() {
    window.addEventListener("online", () => {
      this.isOnline = true
      this.updateConnectionStatus()
      if (this.initialized) {
        this.syncPendingData()
      }
    })

    window.addEventListener("offline", () => {
      this.isOnline = false
      this.updateConnectionStatus()
    })

    // Update initial status
    this.updateConnectionStatus()
  }

  // Update UI to show connection status
  updateConnectionStatus() {
    const statusElement = document.getElementById("connection-status")
    if (statusElement) {
      if (this.isOnline) {
        if (this.initialized) {
          statusElement.innerHTML = `
                        <div class="flex items-center text-green-600 text-sm">
                            <i class="fas fa-wifi mr-2"></i>
                            <span>Online (Offline Ready)</span>
                        </div>
                    `
        } else {
          statusElement.innerHTML = `
                        <div class="flex items-center text-yellow-600 text-sm">
                            <i class="fas fa-wifi mr-2"></i>
                            <span>Online (Offline Unavailable)</span>
                        </div>
                    `
        }
      } else {
        if (this.initialized) {
          statusElement.innerHTML = `
                        <div class="flex items-center text-orange-600 text-sm">
                            <i class="fas fa-wifi-slash mr-2"></i>
                            <span>Offline - Data will sync when online</span>
                        </div>
                    `
        } else {
          statusElement.innerHTML = `
                        <div class="flex items-center text-red-600 text-sm">
                            <i class="fas fa-wifi-slash mr-2"></i>
                            <span>Offline - No offline storage</span>
                        </div>
                    `
        }
      }
    }

    // Update pending sync count
    if (this.initialized) {
      this.updatePendingSyncCount()
    }
  }

  // Save session data offline
  async saveSessionOffline(sessionData, photos = []) {
    console.log("🔄 saveSessionOffline called with:", { sessionData, photoCount: photos.length })

    // Ensure we're initialized
    const isReady = await this.ensureInitialized()

    if (!isReady || !this.db) {
      const errorMsg = this.initError
        ? `Offline storage failed to initialize: ${this.initError.message}`
        : "Offline storage not available"
      console.error("❌", errorMsg)
      throw new Error(errorMsg)
    }

    try {
      console.log("💾 Starting offline session save...")

      const transaction = this.db.transaction(["sessions", "photos"], "readwrite")

      // Handle transaction errors
      transaction.onerror = () => {
        console.error("❌ Transaction error:", transaction.error)
      }

      const sessionStore = transaction.objectStore("sessions")
      const photoStore = transaction.objectStore("photos")

      // Add metadata for offline storage
      const offlineSession = {
        ...sessionData,
        timestamp: new Date().toISOString(),
        synced: false,
        offline: true,
      }

      console.log("💾 Saving session to IndexedDB:", offlineSession)

      // Save session
      const sessionResult = await new Promise((resolve, reject) => {
        const request = sessionStore.add(offlineSession)
        request.onsuccess = () => {
          console.log("✅ Session saved with tempId:", request.result)
          resolve(request.result)
        }
        request.onerror = () => {
          console.error("❌ Failed to save session:", request.error)
          reject(new Error("Failed to save session: " + (request.error?.message || "Unknown error")))
        }
      })

      const sessionTempId = sessionResult

      // Save photos if any
      console.log("📸 Saving", photos.length, "photos...")
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i]
        const photoData = {
          sessionTempId: sessionTempId,
          file: photo,
          filename: photo.name,
          size: photo.size,
          type: photo.type,
          timestamp: new Date().toISOString(),
          synced: false,
        }

        await new Promise((resolve, reject) => {
          const request = photoStore.add(photoData)
          request.onsuccess = () => {
            console.log("✅ Photo", i + 1, "saved successfully")
            resolve(request.result)
          }
          request.onerror = () => {
            console.error("❌ Failed to save photo:", request.error)
            reject(new Error("Failed to save photo: " + (request.error?.message || "Unknown error")))
          }
        })
      }

      console.log("🎉 All data saved offline successfully")
      this.updatePendingSyncCount()
      return sessionTempId
    } catch (error) {
      console.error("❌ Error in saveSessionOffline:", error)
      throw error
    }
  }

  // Rest of the methods remain the same...
  async getPendingSessions() {
    if (!this.db) return []

    const transaction = this.db.transaction(["sessions"], "readonly")
    const store = transaction.objectStore("sessions")

    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => {
        // Filter for unsynced sessions in JavaScript instead of using index incorrectly
        const allSessions = request.result
        const unsyncedSessions = allSessions.filter((session) => session.synced === false)
        resolve(unsyncedSessions)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getSessionPhotos(sessionTempId) {
    if (!this.db) return []

    const transaction = this.db.transaction(["photos"], "readonly")
    const store = transaction.objectStore("photos")
    const index = store.index("sessionTempId")

    return new Promise((resolve, reject) => {
      const request = index.getAll(sessionTempId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async syncPendingData() {
    if (!this.isOnline || !this.initialized) return

    try {
      const pendingSessions = await this.getPendingSessions()
      console.log(`🔄 Syncing ${pendingSessions.length} pending sessions...`)

      for (const session of pendingSessions) {
        await this.syncSession(session)
      }

      this.updatePendingSyncCount()
      if (pendingSessions.length > 0) {
        this.showSyncNotification("All data synced successfully!", "success")
      }
    } catch (error) {
      console.error("Sync failed:", error)
      this.showSyncNotification("Sync failed. Will retry later.", "error")
    }
  }

  async syncSession(session) {
    try {
      const sessionData = { ...session }
      delete sessionData.tempId
      delete sessionData.timestamp
      delete sessionData.synced
      delete sessionData.offline

      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sessionData),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()

      if (result.success) {
        const serverSessionId = result.session_id

        const photos = await this.getSessionPhotos(session.tempId)
        if (photos.length > 0) {
          await this.syncPhotos(serverSessionId, photos)
        }

        await this.markSessionSynced(session.tempId)
        console.log(`✅ Session ${session.tempId} synced successfully`)
      } else {
        throw new Error(result.errors?.join(", ") || "Unknown error")
      }
    } catch (error) {
      console.error(`❌ Failed to sync session ${session.tempId}:`, error)
      throw error
    }
  }

  async syncPhotos(serverSessionId, photos) {
    const formData = new FormData()

    for (const photo of photos) {
      formData.append("photos", photo.file)
    }

    const response = await fetch(`/api/sessions/${serverSessionId}/photos`, {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`Photo upload failed: ${response.status}`)
    }

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.errors?.join(", ") || "Photo upload failed")
    }

    for (const photo of photos) {
      await this.markPhotoSynced(photo.tempId)
    }
  }

  async markSessionSynced(tempId) {
    const transaction = this.db.transaction(["sessions"], "readwrite")
    const store = transaction.objectStore("sessions")

    return new Promise((resolve, reject) => {
      const getRequest = store.get(tempId)
      getRequest.onsuccess = () => {
        const session = getRequest.result
        session.synced = true

        const putRequest = store.put(session)
        putRequest.onsuccess = () => resolve()
        putRequest.onerror = () => reject(putRequest.error)
      }
      getRequest.onerror = () => reject(getRequest.error)
    })
  }

  async markPhotoSynced(tempId) {
    const transaction = this.db.transaction(["photos"], "readwrite")
    const store = transaction.objectStore("photos")

    return new Promise((resolve, reject) => {
      const getRequest = store.get(tempId)
      getRequest.onsuccess = () => {
        const photo = getRequest.result
        photo.synced = true

        const putRequest = store.put(photo)
        putRequest.onsuccess = () => resolve()
        putRequest.onerror = () => reject(putRequest.error)
      }
      getRequest.onerror = () => reject(getRequest.error)
    })
  }

  async updatePendingSyncCount() {
    if (!this.initialized) return

    try {
      const pendingSessions = await this.getPendingSessions()
      const countElement = document.getElementById("pending-sync-count")

      if (countElement) {
        if (pendingSessions.length > 0) {
          countElement.innerHTML = `
                        <div class="flex items-center text-orange-600 text-sm">
                            <i class="fas fa-sync-alt mr-2"></i>
                            <span>${pendingSessions.length} session${pendingSessions.length > 1 ? "s" : ""} pending sync</span>
                        </div>
                    `
          countElement.classList.remove("hidden")
        } else {
          countElement.classList.add("hidden")
        }
      }
    } catch (error) {
      console.error("Error updating sync count:", error)
    }
  }

  showSyncNotification(message, type = "info") {
    const notification = document.createElement("div")
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm ${
      type === "success"
        ? "bg-green-500 text-white"
        : type === "error"
          ? "bg-red-500 text-white"
          : "bg-blue-500 text-white"
    }`

    notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-${type === "success" ? "check" : type === "error" ? "exclamation-triangle" : "info"} mr-2"></i>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `

    document.body.appendChild(notification)

    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove()
      }
    }, 5000)
  }

  startPeriodicSync() {
    setInterval(() => {
      if (this.isOnline && this.initialized) {
        this.syncPendingData()
      }
    }, 30000)
  }

  async manualSync() {
    if (!this.isOnline) {
      this.showSyncNotification("Cannot sync while offline", "error")
      return
    }

    if (!this.initialized) {
      this.showSyncNotification("Offline sync not available", "error")
      return
    }

    this.showSyncNotification("Syncing data...", "info")
    await this.syncPendingData()
  }

  // Get offline sessions for display
  async getOfflineSessions() {
    if (!this.initialized) return []

    const transaction = this.db.transaction(["sessions"], "readonly")
    const store = transaction.objectStore("sessions")

    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => {
        const sessions = request.result.map((session) => ({
          ...session,
          id: `offline_${session.tempId}`,
          isOffline: true,
        }))
        resolve(sessions)
      }
      request.onerror = () => reject(request.error)
    })
  }

  // Clean up synced data (optional - to save space)
  async cleanupSyncedData() {
    if (!this.initialized) return

    const transaction = this.db.transaction(["sessions", "photos"], "readwrite")
    const sessionStore = transaction.objectStore("sessions")
    const photoStore = transaction.objectStore("photos")

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    // Get all sessions and filter in JavaScript
    const sessionRequest = sessionStore.getAll()
    sessionRequest.onsuccess = () => {
      const allSessions = sessionRequest.result
      const syncedOldSessions = allSessions.filter(
        (session) => session.synced === true && new Date(session.timestamp) < weekAgo,
      )

      syncedOldSessions.forEach((session) => {
        sessionStore.delete(session.tempId)
      })
    }

    // Get all photos and filter in JavaScript
    const photoRequest = photoStore.getAll()
    photoRequest.onsuccess = () => {
      const allPhotos = photoRequest.result
      const syncedOldPhotos = allPhotos.filter((photo) => photo.synced === true && new Date(photo.timestamp) < weekAgo)

      syncedOldPhotos.forEach((photo) => {
        photoStore.delete(photo.tempId)
      })
    }
  }
}

// Make sure the class is available globally
window.OfflineSyncManager = OfflineSyncManager

// Don't auto-initialize here - let the base template handle it
console.log("Offline sync manager class loaded")
