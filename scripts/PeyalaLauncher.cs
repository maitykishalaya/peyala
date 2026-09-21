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
        private static string appDir;
        private static string portableNodeDir;
        private static string browserPath;
        private static string browserName;

        [STAThread]
        static void Main(string[] args)
        {
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

            // Find Chrome or Edge
            LocateBrowser();

            // Setup System Tray
            InitializeTray();

            // Free previous ports 3000 & 4000
            FreePort(3000);
            FreePort(4000);

            // Start backend and frontend
            StartServers();

            // Wait for local server to be ready in background thread
            Thread waitThread = new Thread(() =>
            {
                bool isReady = WaitForServer(3000, 60);
                if (isReady)
                {
                    Thread.Sleep(1500); // settle
                    LaunchBrowser(args.Length > 0 && args[0].ToLower() == "--windowed");
                }
                else
                {
                    MessageBox.Show(
                        "Peyala local server took too long to respond on port 3000.\nCheck if Node.js is installed or start manually with start-local-kiosk.bat.",
                        "Peyala POS Warning",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning
                    );
                }
            });
            waitThread.IsBackground = true;
            waitThread.Start();

            // Keep application running in background for tray icon
            Application.Run();
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
            MenuItem header = new MenuItem("🍵 Peyala POS Station (Port 3000)");
            header.Enabled = false;
            menu.MenuItems.Add(header);
            menu.MenuItems.Add(new MenuItem("-"));

            MenuItem openKiosk = new MenuItem("Open in Kiosk Mode", (s, e) => LaunchBrowser(false));
            MenuItem openWindowed = new MenuItem("Open in Windowed Mode", (s, e) => LaunchBrowser(true));
            MenuItem restart = new MenuItem("Restart Local Servers", (s, e) => RestartServers());
            MenuItem exit = new MenuItem("Stop Servers & Exit", (s, e) => ExitApplication());

            menu.MenuItems.Add(openKiosk);
            menu.MenuItems.Add(openWindowed);
            menu.MenuItems.Add(new MenuItem("-"));
            menu.MenuItems.Add(restart);
            menu.MenuItems.Add(exit);

            trayIcon = new NotifyIcon();
            trayIcon.Text = "Peyala POS (Local Server)";
            trayIcon.Icon = SystemIcons.Application;
            trayIcon.ContextMenu = menu;
            trayIcon.Visible = true;

            trayIcon.DoubleClick += (s, e) => LaunchBrowser(false);
        }

        private static void StartServers()
        {
            try
            {
                string backendDir = Path.Combine(appDir, "backend");
                string frontendDir = Path.Combine(appDir, "frontend");

                // Start Backend
                ProcessStartInfo bInfo = new ProcessStartInfo("cmd.exe", "/c npm run dev")
                {
                    WorkingDirectory = backendDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                backendProcess = Process.Start(bInfo);

                // Start Frontend
                ProcessStartInfo fInfo = new ProcessStartInfo("cmd.exe", "/c npm run dev")
                {
                    WorkingDirectory = frontendDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                frontendProcess = Process.Start(fInfo);
            }
            catch (Exception ex)
            {
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
            string url = "http://localhost:3000/login";
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
                    UseShellExecute = false
                };
                browserProcess = Process.Start(info);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to launch browser: " + ex.Message);
            }
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

            Application.Exit();
            Environment.Exit(0);
        }
    }
}
