// Enhanced Mobile-Compatible Offline Data Sync Manager
class MobileOfflineSyncManager {
  constructor() {
    this.dbName = "NZCActivatorOffline"
    this.version = 1
    this.db = null
    this.isOnline = navigator.onLine
    this.syncQueue = []
    this.initialized = false
    this.initPromise = null
    this.initError = null
    this.isMobile = this.detectMobile()
    this.touchSupported = "ontouchstart" in window

    console.log(`🔧 Initializing for ${this.isMobile ? "Mobile" : "Desktop"} device`)

    // Mobile-specific initialization with longer timeout
    this.initPromise = this.init()
  }

  detectMobile() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera
    return (
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase()) ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform))
    )
  }

  async init() {
    try {
      console.log("🔄 Initializing mobile offline sync manager...")

      // Mobile-specific checks
      if (this.isMobile) {
        console.log("📱 Mobile device detected - applying mobile optimizations")

        // Check if we're in a WebView or restricted environment
        if (this.isRestrictedEnvironment()) {
          console.warn("⚠️ Restricted mobile environment detected")
        }
      }

      // Check IndexedDB support with mobile-specific fallbacks
      if (!this.checkIndexedDBSupport()) {
        throw new Error("IndexedDB not supported or blocked on this mobile browser")
      }

      await this.initIndexedDB()
      console.log("✅ IndexedDB initialized successfully on mobile")

      this.setupEventListeners()
      this.startPeriodicSync()
      this.initialized = true
      this.initError = null

      // Mobile-specific: Check for pending syncs with delay
      if (this.isOnline) {
        setTimeout(() => this.syncPendingData(), this.isMobile ? 2000 : 1000)
      }

      console.log("✅ Mobile offline sync manager initialized successfully")
      this.updateConnectionStatus()

      return true
    } catch (error) {
      console.error("❌ Failed to initialize mobile offline sync manager:", error)
      this.initialized = false
      this.initError = error
      this.updateConnectionStatus()
      throw error
    }
  }

  isRestrictedEnvironment() {
    // Check for common mobile restrictions
    try {
      // Test localStorage access
      localStorage.setItem("test", "test")
      localStorage.removeItem("test")

      // Check if we're in private browsing mode
      if (this.isPrivateBrowsing()) {
        console.warn("⚠️ Private browsing mode detected - may affect offline storage")
        return true
      }

      return false
    } catch (e) {
      console.warn("⚠️ Storage access restricted:", e)
      return true
    }
  }

  isPrivateBrowsing() {
    try {
      // Safari private browsing detection
      if (window.safari && window.safari.pushNotification) {
        return window.safari.pushNotification.toString() === "[object SafariRemoteNotification]"
      }

      // Chrome/Firefox private browsing
      const storage = window.sessionStorage
      storage.setItem("test", "1")
      storage.removeItem("test")
      return false
    } catch (e) {
      return true
    }
  }

  checkIndexedDBSupport() {
    if (!window.indexedDB) {
      console.error("❌ IndexedDB not supported")
      return false
    }

    // Mobile-specific IndexedDB checks
    if (this.isMobile) {
      // Check for known mobile browser issues
      const userAgent = navigator.userAgent.toLowerCase()

      // Old Android browsers
      if (userAgent.includes("android") && userAgent.includes("chrome")) {
        const chromeVersion = userAgent.match(/chrome\/(\d+)/)
        if (chromeVersion && Number.parseInt(chromeVersion[1]) < 50) {
          console.warn("⚠️ Old Chrome version on Android - IndexedDB may be unreliable")
        }
      }

      // iOS Safari issues
      if (userAgent.includes("safari") && userAgent.includes("mobile")) {
        const iosVersion = userAgent.match(/os (\d+)_/)
        if (iosVersion && Number.parseInt(iosVersion[1]) < 10) {
          console.warn("⚠️ Old iOS version - IndexedDB may be unreliable")
        }
      }
    }

    return true
  }

  async initIndexedDB() {
    return new Promise((resolve, reject) => {
      console.log("📱 Opening IndexedDB on mobile...")

      // Mobile-specific timeout
      const timeout = setTimeout(
        () => {
          reject(new Error("IndexedDB open timeout on mobile device"))
        },
        this.isMobile ? 15000 : 10000,
      )

      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => {
        clearTimeout(timeout)
        const error = new Error("Failed to open IndexedDB on mobile: " + (request.error?.message || "Unknown error"))
        console.error("❌ IndexedDB mobile error:", error)
        reject(error)
      }

      request.onsuccess = () => {
        clearTimeout(timeout)
        this.db = request.result
        console.log("✅ IndexedDB opened successfully on mobile")

        // Mobile-specific error handling
        this.db.onerror = (event) => {
          console.error("❌ IndexedDB mobile runtime error:", event)
        }

        this.db.onversionchange = () => {
          console.warn("⚠️ IndexedDB version change on mobile - closing connection")
          this.db.close()
          this.initialized = false
        }

        // Test database functionality on mobile
        this.testDatabase()
          .then(() => {
            console.log("✅ Mobile database test successful")
            resolve()
          })
          .catch((testError) => {
            console.error("❌ Mobile database test failed:", testError)
            reject(new Error("Mobile database test failed: " + testError.message))
          })
      }

      request.onupgradeneeded = (event) => {
        console.log("🔄 Upgrading IndexedDB schema on mobile...")
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
            console.log("✅ Created sessions store on mobile")
          }

          // Store for offline photos
          if (!db.objectStoreNames.contains("photos")) {
            const photoStore = db.createObjectStore("photos", {
              keyPath: "tempId",
              autoIncrement: true,
            })
            photoStore.createIndex("sessionTempId", "sessionTempId", { unique: false })
            photoStore.createIndex("synced", "synced", { unique: false })
            console.log("✅ Created photos store on mobile")
          }

          // Store for sync queue
          if (!db.objectStoreNames.contains("syncQueue")) {
            db.createObjectStore("syncQueue", {
              keyPath: "id",
              autoIncrement: true,
            })
            console.log("✅ Created syncQueue store on mobile")
          }

          console.log("✅ Mobile database schema upgrade completed")
        } catch (schemaError) {
          console.error("❌ Mobile schema upgrade error:", schemaError)
          throw schemaError
        }
      }

      request.onblocked = () => {
        clearTimeout(timeout)
        console.warn("⚠️ IndexedDB upgrade blocked on mobile - another tab may be open")
        reject(new Error("Database upgrade blocked on mobile. Please close other tabs and try again."))
      }
    })
  }

  async testDatabase() {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(["sessions"], "readwrite")
        const store = transaction.objectStore("sessions")

        const testData = {
          test: true,
          timestamp: new Date().toISOString(),
          synced: true,
          mobile: true,
        }

        const request = store.add(testData)

        request.onsuccess = () => {
          // Clean up test data
          const deleteRequest = store.delete(request.result)
          deleteRequest.onsuccess = () => {
            console.log("✅ Mobile database test completed successfully")
            resolve()
          }
          deleteRequest.onerror = () => {
            console.log("✅ Mobile database test completed (cleanup failed but that's OK)")
            resolve()
          }
        }

        request.onerror = () => {
          reject(new Error("Mobile database write test failed: " + request.error?.message))
        }

        transaction.onerror = () => {
          reject(new Error("Mobile database transaction failed: " + transaction.error?.message))
        }

        // Mobile-specific timeout for database operations
        setTimeout(
          () => {
            reject(new Error("Mobile database test timeout"))
          },
          this.isMobile ? 10000 : 5000,
        )
      } catch (error) {
        reject(new Error("Mobile database test setup failed: " + error.message))
      }
    })
  }

  setupEventListeners() {
    // Enhanced mobile event listeners
    const onlineHandler = () => {
      console.log("📱 Mobile device came online")
      this.isOnline = true
      this.updateConnectionStatus()
      if (this.initialized) {
        // Delay sync on mobile to ensure stable connection
        setTimeout(() => this.syncPendingData(), this.isMobile ? 3000 : 1000)
      }
    }

    const offlineHandler = () => {
      console.log("📱 Mobile device went offline")
      this.isOnline = false
      this.updateConnectionStatus()
    }

    window.addEventListener("online", onlineHandler)
    window.addEventListener("offline", offlineHandler)

    // Mobile-specific events
    if (this.isMobile) {
      // Handle mobile app lifecycle
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && this.isOnline && this.initialized) {
          console.log("📱 Mobile app became visible - checking for sync")
          setTimeout(() => this.syncPendingData(), 2000)
        }
      })

      // Handle mobile page lifecycle
      window.addEventListener("pageshow", (event) => {
        if (event.persisted && this.isOnline && this.initialized) {
          console.log("📱 Mobile page restored from cache - syncing")
          setTimeout(() => this.syncPendingData(), 1000)
        }
      })

      // Handle mobile focus events
      window.addEventListener("focus", () => {
        if (this.isOnline && this.initialized) {
          console.log("📱 Mobile window focused - checking sync")
          setTimeout(() => this.updateConnectionStatus(), 500)
        }
      })
    }

    this.updateConnectionStatus()
  }

  updateConnectionStatus() {
    const statusElement = document.getElementById("connection-status")
    const mobileStatusElement = document.getElementById("mobile-connection-status")

    let statusHTML = ""

    if (this.isOnline) {
      if (this.initialized) {
        statusHTML = `
          <div class="flex items-center text-green-600 text-sm">
              <i class="fas fa-wifi mr-2"></i>
              <span>Online${this.isMobile ? " (Mobile)" : ""} - Offline Ready</span>
          </div>
        `
      } else {
        statusHTML = `
          <div class="flex items-center text-yellow-600 text-sm">
              <i class="fas fa-wifi mr-2"></i>
              <span>Online${this.isMobile ? " (Mobile)" : ""} - Offline Unavailable</span>
          </div>
        `
      }
    } else {
      if (this.initialized) {
        statusHTML = `
          <div class="flex items-center text-orange-600 text-sm">
              <i class="fas fa-wifi-slash mr-2"></i>
              <span>Offline${this.isMobile ? " (Mobile)" : ""} - Will sync when online</span>
          </div>
        `
      } else {
        statusHTML = `
          <div class="flex items-center text-red-600 text-sm">
              <i class="fas fa-wifi-slash mr-2"></i>
              <span>Offline${this.isMobile ? " (Mobile)" : ""} - No offline storage</span>
          </div>
        `
      }
    }

    if (statusElement) {
      statusElement.innerHTML = statusHTML
    }

    if (mobileStatusElement) {
      mobileStatusElement.innerHTML = statusHTML
    }

    if (this.initialized) {
      this.updatePendingSyncCount()
    }
  }

  // Enhanced mobile-compatible session saving
  async saveSessionOffline(sessionData, photos = []) {
    console.log("📱 Mobile saveSessionOffline called with:", { sessionData, photoCount: photos.length })

    const isReady = await this.ensureInitialized()

    if (!isReady || !this.db) {
      const errorMsg = this.initError
        ? `Mobile offline storage failed to initialize: ${this.initError.message}`
        : "Mobile offline storage not available"
      console.error("❌", errorMsg)
      throw new Error(errorMsg)
    }

    try {
      console.log("📱 Starting mobile offline session save...")

      // Mobile-specific transaction timeout
      const transaction = this.db.transaction(["sessions", "photos"], "readwrite")

      // Add mobile-specific error handling
      transaction.onerror = () => {
        console.error("❌ Mobile transaction error:", transaction.error)
      }

      transaction.onabort = () => {
        console.error("❌ Mobile transaction aborted:", transaction.error)
      }

      const sessionStore = transaction.objectStore("sessions")
      const photoStore = transaction.objectStore("photos")

      const offlineSession = {
        ...sessionData,
        timestamp: new Date().toISOString(),
        synced: false,
        offline: true,
        mobile: true,
        userAgent: navigator.userAgent,
      }

      console.log("📱 Saving mobile session to IndexedDB:", offlineSession)

      // Save session with mobile-specific timeout
      const sessionResult = await Promise.race([
        new Promise((resolve, reject) => {
          const request = sessionStore.add(offlineSession)
          request.onsuccess = () => {
            console.log("✅ Mobile session saved with tempId:", request.result)
            resolve(request.result)
          }
          request.onerror = () => {
            console.error("❌ Failed to save mobile session:", request.error)
            reject(new Error("Failed to save mobile session: " + (request.error?.message || "Unknown error")))
          }
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Mobile session save timeout")), 15000)
        }),
      ])

      const sessionTempId = sessionResult

      // Save photos with mobile optimizations
      console.log("📱 Saving", photos.length, "photos on mobile...")
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i]

        // Mobile-specific photo size check
        if (photo.size > 10 * 1024 * 1024) {
          // 10MB limit for mobile
          console.warn(`⚠️ Photo ${i + 1} is large (${photo.size} bytes) - may cause issues on mobile`)
        }

        const photoData = {
          sessionTempId: sessionTempId,
          file: photo,
          filename: photo.name,
          size: photo.size,
          type: photo.type,
          timestamp: new Date().toISOString(),
          synced: false,
          mobile: true,
        }

        await Promise.race([
          new Promise((resolve, reject) => {
            const request = photoStore.add(photoData)
            request.onsuccess = () => {
              console.log(`✅ Mobile photo ${i + 1} saved successfully`)
              resolve(request.result)
            }
            request.onerror = () => {
              console.error(`❌ Failed to save mobile photo ${i + 1}:`, request.error)
              reject(new Error("Failed to save mobile photo: " + (request.error?.message || "Unknown error")))
            }
          }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Mobile photo ${i + 1} save timeout`)), 20000)
          }),
        ])
      }

      console.log("🎉 All mobile data saved offline successfully")
      this.updatePendingSyncCount()
      return sessionTempId
    } catch (error) {
      console.error("❌ Error in mobile saveSessionOffline:", error)
      throw error
    }
  }

  // Mobile-optimized sync with better error handling
  async syncPendingData() {
    if (!this.isOnline || !this.initialized) {
      console.log("📱 Mobile sync skipped - offline or not initialized")
      return
    }

    try {
      const pendingSessions = await this.getPendingSessions()
      console.log(`📱 Mobile syncing ${pendingSessions.length} pending sessions...`)

      if (pendingSessions.length === 0) {
        console.log("📱 No mobile sessions to sync")
        return
      }

      // Mobile-specific: Sync one at a time to avoid overwhelming the connection
      for (const session of pendingSessions) {
        try {
          await this.syncSession(session)
          console.log(`✅ Mobile session ${session.tempId} synced successfully`)

          // Small delay between syncs on mobile
          if (this.isMobile) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
        } catch (sessionError) {
          console.error(`❌ Failed to sync mobile session ${session.tempId}:`, sessionError)
          // Continue with other sessions
        }
      }

      this.updatePendingSyncCount()

      const syncedCount = pendingSessions.length
      if (syncedCount > 0) {
        this.showSyncNotification(
          `${syncedCount} session${syncedCount > 1 ? "s" : ""} synced successfully on mobile!`,
          "success",
        )
      }
    } catch (error) {
      console.error("❌ Mobile sync failed:", error)
      this.showSyncNotification("Mobile sync failed. Will retry later.", "error")
    }
  }

  // Enhanced mobile notification system
  showSyncNotification(message, type = "info") {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll(".mobile-sync-notification")
    existingNotifications.forEach((notification) => notification.remove())

    const notification = document.createElement("div")
    notification.className = `mobile-sync-notification fixed top-4 left-4 right-4 z-50 p-3 rounded-lg shadow-lg text-sm ${
      type === "success"
        ? "bg-green-500 text-white"
        : type === "error"
          ? "bg-red-500 text-white"
          : "bg-blue-500 text-white"
    }`

    // Mobile-optimized notification
    notification.innerHTML = `
      <div class="flex items-center justify-between">
          <div class="flex items-center">
              <i class="fas fa-${type === "success" ? "check" : type === "error" ? "exclamation-triangle" : "info"} mr-2"></i>
              <span>${message}</span>
          </div>
          <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-white hover:text-gray-200">
              <i class="fas fa-times"></i>
          </button>
      </div>
    `

    document.body.appendChild(notification)

    // Auto-remove after longer time on mobile
    setTimeout(
      () => {
        if (notification.parentElement) {
          notification.remove()
        }
      },
      this.isMobile ? 8000 : 5000,
    )
  }

  // Mobile-optimized periodic sync
  startPeriodicSync() {
    // Longer interval on mobile to save battery
    const syncInterval = this.isMobile ? 60000 : 30000 // 1 minute on mobile, 30 seconds on desktop

    setInterval(() => {
      if (this.isOnline && this.initialized && !document.hidden) {
        console.log("📱 Mobile periodic sync check")
        this.syncPendingData()
      }
    }, syncInterval)
  }

  // Enhanced mobile manual sync
  async manualSync() {
    if (!this.isOnline) {
      this.showSyncNotification("Cannot sync while offline", "error")
      return
    }

    if (!this.initialized) {
      this.showSyncNotification("Offline sync not available on this mobile device", "error")
      return
    }

    console.log("📱 Manual mobile sync initiated")
    this.showSyncNotification("Syncing mobile data...", "info")

    try {
      await this.syncPendingData()
    } catch (error) {
      console.error("❌ Manual mobile sync failed:", error)
      this.showSyncNotification("Manual sync failed on mobile", "error")
    }
  }

  // Rest of the methods remain the same but with mobile logging...
  async ensureInitialized() {
    if (this.initPromise) {
      try {
        await this.initPromise
      } catch (error) {
        console.warn("📱 Mobile offline sync initialization failed:", error)
        return false
      }
    }
    return this.initialized
  }

  isReady() {
    return this.initialized && this.db !== null
  }

  getInitError() {
    return this.initError
  }

  async getPendingSessions() {
    if (!this.db) return []

    const transaction = this.db.transaction(["sessions"], "readonly")
    const store = transaction.objectStore("sessions")

    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => {
        const allSessions = request.result
        const unsyncedSessions = allSessions.filter((session) => session.synced === false)
        console.log(`📱 Found ${unsyncedSessions.length} pending mobile sessions`)
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

  async syncSession(session) {
    try {
      const sessionData = { ...session }
      delete sessionData.tempId
      delete sessionData.timestamp
      delete sessionData.synced
      delete sessionData.offline
      delete sessionData.mobile
      delete sessionData.userAgent

      console.log("📱 Syncing mobile session:", sessionData.school_name)

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
          console.log(`📱 Syncing ${photos.length} mobile photos...`)
          await this.syncPhotos(serverSessionId, photos)
        }

        await this.markSessionSynced(session.tempId)
        console.log(`✅ Mobile session ${session.tempId} synced successfully`)
      } else {
        throw new Error(result.errors?.join(", ") || "Unknown error")
      }
    } catch (error) {
      console.error(`❌ Failed to sync mobile session ${session.tempId}:`, error)
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
      throw new Error(`Mobile photo upload failed: ${response.status}`)
    }

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.errors?.join(", ") || "Mobile photo upload failed")
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
      const mobileCountElement = document.getElementById("mobile-pending-sync-count")

      const countHTML =
        pendingSessions.length > 0
          ? `
        <div class="flex items-center text-orange-600 text-sm">
            <i class="fas fa-sync-alt mr-2"></i>
            <span>${pendingSessions.length} session${pendingSessions.length > 1 ? "s" : ""} pending sync${this.isMobile ? " (Mobile)" : ""}</span>
        </div>
      `
          : ""

      if (countElement) {
        if (pendingSessions.length > 0) {
          countElement.innerHTML = countHTML
          countElement.classList.remove("hidden")
        } else {
          countElement.classList.add("hidden")
        }
      }

      if (mobileCountElement) {
        if (pendingSessions.length > 0) {
          mobileCountElement.innerHTML = countHTML
          mobileCountElement.classList.remove("hidden")
        } else {
          mobileCountElement.classList.add("hidden")
        }
      }
    } catch (error) {
      console.error("❌ Error updating mobile sync count:", error)
    }
  }

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

  async cleanupSyncedData() {
    if (!this.initialized) return

    const transaction = this.db.transaction(["sessions", "photos"], "readwrite")
    const sessionStore = transaction.objectStore("sessions")
    const photoStore = transaction.objectStore("photos")

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

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
window.MobileOfflineSyncManager = MobileOfflineSyncManager

console.log("📱 Mobile offline sync manager class loaded")
