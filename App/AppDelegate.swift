//
//  AppDelegate.swift — Studio T, l'app dello studio (dottoressa e segretaria; iPhone e iPad)
//  "npm run sync" (prepara-ios.mjs) lo copia in ios/App/App/ al posto di quello di Capacitor.
//  E' lo stesso dell'app dei pazienti (app-nativa/ios-extra): stesse notifiche, stesso progetto Firebase.
//
//  Notifiche: iOS consegna un token APNs, ma il Worker dei promemoria invia con Firebase Cloud
//  Messaging (come per Android). Qui il token APNs passa a Firebase, che restituisce il token
//  FCM: e' quello che Capacitor consegna alla pagina di accesso dell'app, che lo registra nell'API.
//  Finche' nel progetto Xcode mancano il pacchetto FirebaseMessaging o GoogleService-Info.plist
//  l'app si compila e funziona lo stesso, senza notifiche dello studio.
//  Quando l'app si apre il numerino sull'icona si azzera (le notifiche sono state viste).
//

import UIKit
import Capacitor
import UserNotifications
#if canImport(FirebaseCore) && canImport(FirebaseMessaging)
import FirebaseCore
import FirebaseMessaging
#endif

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        #if canImport(FirebaseCore) && canImport(FirebaseMessaging)
        // senza GoogleService-Info.plist Firebase fermerebbe l'app: in quel caso si salta
        if FirebaseApp.app() == nil, Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
        }
        #endif
        NotificationCenter.default.addObserver(self, selector: #selector(appAttiva), name: UIApplication.didBecomeActiveNotification, object: nil)
        return true
    }

    /// App aperta o tornata in primo piano: via il numerino sull'icona.
    @objc func appAttiva() {
        if #available(iOS 16.0, *) {
            UNUserNotificationCenter.current().setBadgeCount(0) { _ in }
        } else {
            UIApplication.shared.applicationIconBadgeNumber = 0
        }
    }

    // MARK: - Scene (come nel file generato da Capacitor 8)

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    // MARK: - Notifiche push: da APNs a Firebase, poi a Capacitor

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        #if canImport(FirebaseCore) && canImport(FirebaseMessaging)
        if FirebaseApp.app() != nil {
            Messaging.messaging().apnsToken = deviceToken
            Messaging.messaging().token { token, error in
                if let error = error {
                    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
                } else if let token = token {
                    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
                }
            }
            return
        }
        #endif
        // senza Firebase le notifiche dello studio non possono arrivare: lo si dice all'app web
        let errore = NSError(domain: "StudioTramontanoStudio", code: 1,
                             userInfo: [NSLocalizedDescriptionKey: "Firebase non configurato (FirebaseMessaging e GoogleService-Info.plist)"])
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: errore)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}
