declare module "aircall-everywhere" {
    export default class AircallPhone {
        constructor(opts: { domToLoadPhone: string; integrationToLoad?: string; onLogin?: (settings?: unknown) => void; onLogout?: () => void; size?: string });
        send(event: string, payload?: unknown, callback?: (success: boolean, data?: unknown) => void): void;
        on(event: string, callback: (data?: unknown) => void): void;
        isLoggedIn(callback: (loggedIn: boolean) => void): void;
    }
}
