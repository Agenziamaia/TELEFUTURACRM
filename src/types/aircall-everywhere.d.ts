declare module "aircall-everywhere" {
    export default class AircallWorkspace {
        constructor(opts: {
            domToLoadWorkspace: string;
            workspaceUrl?: string;
            integrationToLoad?: string;
            onLogin?: (settings?: unknown) => void;
            onLogout?: () => void;
            debug?: boolean;
        });
        send(event: string, payload?: unknown, callback?: (success: boolean, data?: unknown) => void): void;
        on(event: string, callback: (data?: unknown) => void): void;
        isLoggedIn(callback: (loggedIn: boolean) => void): void;
    }
}
