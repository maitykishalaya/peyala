using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace PeyalaPOS
{
    static class Program
    {
        private static NotifyIcon trayIcon;
        private static Process backendProcess;
        private static Process frontendProcess;
        private static Process browserProcess;
        private static Mutex singleInstanceMutex;
        private static string appDir;
        private static string portableNodeDir;
        private static string browserPath;
        private static string browserName;

        [STAThread]
        static void Main(string[] args)
        {
            // Enforce single instance to prevent duplicate tray icons and server port conflicts
            bool createdNew;
            singleInstanceMutex = new Mutex(true, "Global\\PeyalaPOS_SingleInstance_Mutex_v8", out createdNew);
            if (!createdNew)
            {
                // Another instance of Peyala POS is already running!
                // Open/focus POS browser portal so cashier immediately sees the screen, then exit cleanly.
                try
                {
                    Process.Start("http://localhost:3000/login?printStation=true");
                }
                catch { }
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            appDir = AppDomain.CurrentDomain.BaseDirectory;
            portableNodeDir = Path.Combine(appDir, "portable-node");

            // Setup PATH if portable node exists
            if (Directory.Exists(portableNodeDir))
            {
                string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
                Environment.SetEnvironmentVariable("PATH", portableNodeDir + ";" + pathEnv);
            }

            try
            {
                // Check if dedicated Electron desktop application is available
                string electronExe = Path.Combine(appDir, "desktop", "node_modules", "electron", "dist", "electron.exe");
                string desktopDir = Path.Combine(appDir, "desktop");
                if (File.Exists(electronExe) && Directory.Exists(desktopDir))
                {
                    try
                    {
                        ProcessStartInfo eInfo = new ProcessStartInfo(electronExe, string.Format("\"{0}\" --disable-gpu", desktopDir))
                        {
                            WorkingDirectory = desktopDir,
                            UseShellExecute = false
                        };
                        browserProcess = Process.Start(eInfo);
                        // Electron manages its own dedicated tray icon, single-instance lock, and servers.
                        // Wait for Electron to close, then exit cleanly without creating duplicate WinForms tray icons.
                        browserProcess.WaitForExit();
                        return;
                    }
                    catch { }
                }

                // Fallback mode: Standalone Web/Kiosk mode (Google Chrome or Microsoft Edge)
                LocateBrowser();
                InitializeTray();

                if (!IsPortListening(3000) || !IsPortListening(4000))
                {
                    FreePort(3000);
                    FreePort(4000);
                    StartServers();
                }

                // Wait for local server to be ready in background thread
                Thread waitThread = new Thread(() =>
                {
                    bool isReady = WaitForServer(3000, 120);
                    if (isReady || IsPortListening(3000))
                    {
                        Thread.Sleep(1000); // settle
                        LaunchBrowser(args.Length > 0 && args[0].ToLower() == "--windowed");
                    }
                    else
                    {
                        // Final retry probe after 2s
                        Thread.Sleep(2000);
                        if (IsPortListening(3000))
                        {
                            LaunchBrowser(args.Length > 0 && args[0].ToLower() == "--windowed");
                            return;
                        }
                        MessageBox.Show(
                            "Peyala local server is taking longer than expected to bind port 3000.\nServers are still initializing in the background.\nYou can click 'Open Peyala POS Station' in the system tray or run start-local-kiosk.bat.",
                            "Peyala POS Starting",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information
                        );
                    }
                });
                waitThread.IsBackground = true;
                waitThread.Start();

                // Keep application running in background for tray icon
                Application.Run();
            }
            catch (Exception ex)
            {
                File.WriteAllText(Path.Combine(appDir, "launcher_crash.log"), ex.ToString());
            }
        }

        private static void LocateBrowser()
        {
            string[] chromePaths = new string[]
            {
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe")
            };

            foreach (string p in chromePaths)
            {
                if (File.Exists(p))
                {
                    browserPath = p;
                    browserName = "Google Chrome";
                    return;
                }
            }

            string[] edgePaths = new string[]
            {
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe")
            };

            foreach (string p in edgePaths)
            {
                if (File.Exists(p))
                {
                    browserPath = p;
                    browserName = "Microsoft Edge";
                    return;
                }
            }
        }

        private static void InitializeTray()
        {
            ContextMenu menu = new ContextMenu();
            MenuItem header = new MenuItem("🍵 Peyala POS - Version 12.0.0 (Port 3000)");
            header.Enabled = false;
            menu.MenuItems.Add(header);
            menu.MenuItems.Add(new MenuItem("-"));

            MenuItem openStation = new MenuItem("Open Peyala POS Station", (s, e) => LaunchApp(false));
            MenuItem openBrowser = new MenuItem("Open in Web Browser", (s, e) => Process.Start("http://localhost:3000/login?printStation=true"));
            MenuItem restart = new MenuItem("Restart Local Servers", (s, e) => RestartServers());
            MenuItem exit = new MenuItem("Stop Servers & Exit", (s, e) => ExitApplication());

            menu.MenuItems.Add(openStation);
            menu.MenuItems.Add(openBrowser);
            menu.MenuItems.Add(new MenuItem("-"));
            menu.MenuItems.Add(restart);
            menu.MenuItems.Add(exit);

            trayIcon = new NotifyIcon();
            trayIcon.Text = "Peyala POS - Version 12.0.0";
            string iconPath = Path.Combine(appDir, "icon.ico");
            if (File.Exists(iconPath))
            {
                try { trayIcon.Icon = new Icon(iconPath); } catch { trayIcon.Icon = SystemIcons.Application; }
            }
            else
            {
                trayIcon.Icon = SystemIcons.Application;
            }
            trayIcon.ContextMenu = menu;
            trayIcon.Visible = true;

            trayIcon.DoubleClick += (s, e) => LaunchApp(false);
        }

        private static string GetNodePath()
        {
            string portable = Path.Combine(portableNodeDir, "node.exe");
            if (File.Exists(portable)) return portable;
            string sys64 = @"C:\Program Files\nodejs\node.exe";
            if (File.Exists(sys64)) return sys64;
            return "node.exe";
        }

        private static void CleanStaleLocks()
        {
            try
            {
                string dbDir = Path.Combine(appDir, "backend", "data", "db");
                string mLock = Path.Combine(dbDir, "mongod.lock");
                string wtLock = Path.Combine(dbDir, "WiredTiger.lock");
                if (File.Exists(mLock)) try { File.Delete(mLock); } catch { }
                if (File.Exists(wtLock)) try { File.Delete(wtLock); } catch { }
            }
            catch { }
        }

        private static void StartServers()
        {
            try
            {
                CleanStaleLocks();
                string nodeExe = GetNodePath();
                string backendDir = Path.Combine(appDir, "backend");
                string frontendDir = Path.Combine(appDir, "frontend");
                string backendScript = Path.Combine(backendDir, "src", "server.js");
                string nextCli = Path.Combine(frontendDir, "node_modules", "next", "dist", "bin", "next");

                string combinedPath = portableNodeDir + ";" + (Environment.GetEnvironmentVariable("PATH") ?? "");

                // Start Backend
                ProcessStartInfo bInfo = new ProcessStartInfo(nodeExe, string.Format("\"{0}\"", backendScript))
                {
                    WorkingDirectory = backendDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                bInfo.EnvironmentVariables["PATH"] = combinedPath;
                bInfo.EnvironmentVariables["NODE_ENV"] = "production";
                bInfo.EnvironmentVariables["PORT"] = "4000";
                backendProcess = Process.Start(bInfo);

                // Start Frontend
                ProcessStartInfo fInfo;
                if (File.Exists(nextCli))
                {
                    fInfo = new ProcessStartInfo(nodeExe, string.Format("\"{0}\" start -p 3000 -H 0.0.0.0", nextCli));
                }
                else
                {
                    string npmCmd = Path.Combine(portableNodeDir, "npm.cmd");
                    if (File.Exists(npmCmd))
                    {
                        fInfo = new ProcessStartInfo(npmCmd, "run start");
                    }
                    else
                    {
                        fInfo = new ProcessStartInfo("cmd.exe", "/c call npm run start");
                    }
                }

                fInfo.WorkingDirectory = frontendDir;
                fInfo.CreateNoWindow = true;
                fInfo.UseShellExecute = false;
                fInfo.WindowStyle = ProcessWindowStyle.Hidden;
                fInfo.EnvironmentVariables["PATH"] = combinedPath;
                fInfo.EnvironmentVariables["NODE_ENV"] = "production";
                fInfo.EnvironmentVariables["PORT"] = "3000";

                frontendProcess = Process.Start(fInfo);
            }
            catch (Exception ex)
            {
                try { File.WriteAllText(Path.Combine(appDir, "launcher_servers_error.log"), ex.ToString()); } catch { }
                MessageBox.Show("Failed to start servers: " + ex.Message, "Peyala POS Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static bool WaitForServer(int port, int timeoutSeconds)
        {
            DateTime start = DateTime.Now;
            while ((DateTime.Now - start).TotalSeconds < timeoutSeconds)
            {
                try
                {
                    using (TcpClient client = new TcpClient())
                    {
                        client.Connect("127.0.0.1", port);
                        return true;
                    }
                }
                catch
                {
                    Thread.Sleep(800);
                }
            }
            return false;
        }

        private static void LaunchBrowser(bool windowed)
        {
            string url = "http://localhost:3000/login?printStation=true";
            string userDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PeyalaPOSProfile");

            if (string.IsNullOrEmpty(browserPath) || !File.Exists(browserPath))
            {
                Process.Start(url);
                return;
            }

            string flags;
            if (windowed)
            {
                flags = string.Format(
                    "--kiosk-printing --user-data-dir=\"{0}\" --disable-features=Translate --no-first-run --no-default-browser-check --disable-pinch --overscroll-history-navigation=0 --disable-infobars --app=\"{1}\"",
                    userDataDir, url
                );
            }
            else
            {
                flags = string.Format(
                    "--kiosk --kiosk-printing --user-data-dir=\"{0}\" --disable-features=Translate --no-first-run --no-default-browser-check --disable-pinch --overscroll-history-navigation=0 --disable-infobars \"{1}\"",
                    userDataDir, url
                );
            }

            try
            {
                ProcessStartInfo info = new ProcessStartInfo(browserPath, flags)
                {
                    UseShellExecute = true
                };
                browserProcess = Process.Start(info);
            }
            catch (Exception ex)
            {
                Process.Start(url);
            }
        }

        private static bool IsPortListening(int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult ar = client.BeginConnect("127.0.0.1", port, null, null);
                    bool success = ar.AsyncWaitHandle.WaitOne(800);
                    if (success)
                    {
                        client.EndConnect(ar);
                        return true;
                    }
                }
            }
            catch { }
            return false;
        }

        private static bool LaunchApp(bool windowed)
        {
            // 1. Try launching dedicated native Electron Desktop App
            string electronExe = Path.Combine(appDir, "desktop", "node_modules", "electron", "dist", "electron.exe");
            string desktopDir = Path.Combine(appDir, "desktop");
            if (File.Exists(electronExe) && Directory.Exists(desktopDir))
            {
                try
                {
                    ProcessStartInfo eInfo = new ProcessStartInfo(electronExe, string.Format("\"{0}\"", desktopDir))
                    {
                        WorkingDirectory = desktopDir,
                        UseShellExecute = false
                    };
                    browserProcess = Process.Start(eInfo);
                    return true;
                }
                catch { }
            }

            // 2. Fall back to Google Chrome or Microsoft Edge Kiosk
            LaunchBrowser(windowed);
            return false;
        }

        private static void RestartServers()
        {
            FreePort(3000);
            FreePort(4000);
            StartServers();
            MessageBox.Show("Servers restarted.", "Peyala POS", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private static void FreePort(int port)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", string.Format("/c for /f \"tokens=5\" %a in ('netstat -aon ^| findstr \":{0} \" ^| findstr \"LISTENING\"') do taskkill /F /PID %a", port))
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit(3000);
                }
            }
            catch { }
        }

        private static void ExitApplication()
        {
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }

            try
            {
                if (backendProcess != null && !backendProcess.HasExited) backendProcess.Kill();
                if (frontendProcess != null && !frontendProcess.HasExited) frontendProcess.Kill();
            }
            catch { }

            FreePort(3000);
            FreePort(4000);

            if (singleInstanceMutex != null)
            {
                try { singleInstanceMutex.ReleaseMutex(); } catch { }
                singleInstanceMutex.Dispose();
            }

            Application.Exit();
            Environment.Exit(0);
        }
    }
}
