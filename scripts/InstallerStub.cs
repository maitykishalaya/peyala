using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

namespace PeyalaInstaller
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Console.Title = "Peyala POS - Standalone 1-Click Laptop Installer";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("====================================================================");
            Console.WriteLine("      PEYALA RESTAURANT OPERATIONS & POS MANAGEMENT SUITE");
            Console.WriteLine("          1-Click Standalone Laptop Installer (.EXE)");
            Console.WriteLine("====================================================================");
            Console.ResetColor();
            Console.WriteLine();
            Console.WriteLine("  This standalone package contains the complete Peyala POS system:");
            Console.WriteLine("    * Production Frontend & Real-Time Waiter Portal");
            Console.WriteLine("    * Local-First Backend API & Offline Auth Vault");
            Console.WriteLine("    * Embedded MongoDB Database Engine (Zero Cloud Dependency)");
            Console.WriteLine("    * Portable Node.js Runtime (No pre-installed software needed)");
            Console.WriteLine("    * Dedicated Native Desktop Application & System Tray Controls");
            Console.WriteLine("    * Direct Hardware Thermal Printing Subsystem");
            Console.WriteLine();
            Console.WriteLine("  Everything is compiled inside this single file. No copying of loose files!");
            Console.WriteLine("====================================================================");
            Console.WriteLine();

            string defaultDir = @"C:\Peyala";
            string targetDir = defaultDir;

            Console.Write("Press ENTER to install to " + defaultDir + ", or type custom path: ");
            string input = Console.ReadLine();
            if (!string.IsNullOrWhiteSpace(input))
            {
                targetDir = input.Trim().Trim('\"');
            }
            targetDir = targetDir.TrimEnd('\\', '/');

            try
            {
                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }
            }
            catch (Exception)
            {
                targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "Peyala");
                Directory.CreateDirectory(targetDir);
            }

            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("[*] Target Directory: " + targetDir);
            Console.ResetColor();

            // Stop any conflicting Peyala processes and free ports
            KillExistingPeyalaProcesses();

            // Clean previous caches/bloat if targetDir already exists
            CleanBloatAndOldCaches(targetDir);

            // Extract self
            string exePath = Assembly.GetExecutingAssembly().Location;
            Console.WriteLine("[*] Extracting all application components into " + targetDir + "...");
            Console.WriteLine("    (This takes ~15 to 30 seconds - please wait...)");

            bool extractSuccess = false;
            try
            {
                ProcessStartInfo tarPsi = new ProcessStartInfo("tar.exe", string.Format("-xf \"{0}\" -C \"{1}\"", exePath, targetDir))
                {
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                Process tarProc = Process.Start(tarPsi);
                tarProc.WaitForExit();
                if (tarProc.ExitCode == 0)
                {
                    extractSuccess = true;
                }
            }
            catch { }

            if (!extractSuccess)
            {
                try
                {
                    ProcessStartInfo psTar = new ProcessStartInfo("powershell.exe", string.Format("-NoProfile -ExecutionPolicy Bypass -Command \"& tar.exe -xf '{0}' -C '{1}'\"", exePath.Replace("'", "''"), targetDir.Replace("'", "''")))
                    {
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    Process p = Process.Start(psTar);
                    p.WaitForExit();
                    if (p.ExitCode == 0)
                    {
                        extractSuccess = true;
                    }
                }
                catch { }
            }

            if (!extractSuccess)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[ERROR] Extraction failed. Please ensure at least 1 GB free disk space.");
                Console.ResetColor();
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
                return;
            }

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[OK] All system files extracted and updated successfully!");
            Console.ResetColor();

            // Clean stale locks and caches
            CleanBloatAndOldCaches(targetDir);

            // Ensure PeyalaPOS.exe exists / recompile if needed
            string buildExeBat = Path.Combine(targetDir, "build-exe.bat");
            if (File.Exists(buildExeBat))
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c call build-exe.bat /quiet")
                    {
                        WorkingDirectory = targetDir,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    Process.Start(psi).WaitForExit();
                }
                catch { }
            }

            // Create Desktop Shortcut
            Console.WriteLine("[*] Creating Desktop and Start Menu shortcuts with official Peyala logo...");
            string shortcutBat = Path.Combine(targetDir, "create-windows-shortcut.bat");
            if (File.Exists(shortcutBat))
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c call create-windows-shortcut.bat /quiet")
                    {
                        WorkingDirectory = targetDir,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    Process.Start(psi).WaitForExit();
                }
                catch { }
            }

            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("====================================================================");
            Console.WriteLine("  Peyala POS Installation / Update Completed Successfully!");
            Console.WriteLine("====================================================================");
            Console.ResetColor();
            Console.WriteLine("  Installed Directory: " + targetDir);
            Console.WriteLine("  Desktop Shortcut:    \"Peyala POS\" on your Windows Desktop");
            Console.WriteLine("  Default Login:       admin@peyala.com / peyala123");
            Console.WriteLine();

            Console.Write("Would you like to launch Peyala POS right now? (Y/N) [Y]: ");
            string launch = Console.ReadLine();
            if (string.IsNullOrWhiteSpace(launch) || launch.Trim().ToLower().StartsWith("y"))
            {
                string peyalaExe = Path.Combine(targetDir, "PeyalaPOS.exe");
                string startBat = Path.Combine(targetDir, "start-peyala-app.bat");
                if (File.Exists(peyalaExe))
                {
                    Process.Start(new ProcessStartInfo(peyalaExe) { WorkingDirectory = targetDir });
                }
                else if (File.Exists(startBat))
                {
                    Process.Start(new ProcessStartInfo("cmd.exe", "/c start-peyala-app.bat") { WorkingDirectory = targetDir });
                }
            }

            Console.WriteLine("Installation complete. Press any key to exit.");
            Console.ReadKey();
        }

        private static void KillExistingPeyalaProcesses()
        {
            string[] procNames = new string[] { "PeyalaPOS", "electron", "mongod" };
            foreach (string p in procNames)
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo("taskkill", "/F /IM " + p + ".exe")
                    {
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    Process.Start(psi).WaitForExit();
                }
                catch { }
            }
            FreePort(3000);
            FreePort(4000);
            FreePort(27017);
            System.Threading.Thread.Sleep(800);
        }

        private static void CleanBloatAndOldCaches(string targetDir)
        {
            try
            {
                if (!Directory.Exists(targetDir)) return;

                // Delete Next.js build cache to prevent 10GB+ disk bloat
                string nextCache = Path.Combine(targetDir, "frontend", ".next", "cache");
                if (Directory.Exists(nextCache))
                {
                    try { Directory.Delete(nextCache, true); } catch { }
                }

                // Delete backend cache
                string bCache = Path.Combine(targetDir, "backend", "node_modules", ".cache");
                if (Directory.Exists(bCache))
                {
                    try { Directory.Delete(bCache, true); } catch { }
                }

                // Delete loose temp and zip files inside target folder
                string currentExe = Assembly.GetExecutingAssembly().Location;
                string[] tempFiles = Directory.GetFiles(targetDir, "*.tmp", SearchOption.TopDirectoryOnly);
                foreach (string f in tempFiles) { try { File.Delete(f); } catch { } }

                // Clean stale locks
                string lockFile = Path.Combine(targetDir, "backend", "data", "db", "mongod.lock");
                try { if (File.Exists(lockFile)) File.Delete(lockFile); } catch { }
                string wtLockFile = Path.Combine(targetDir, "backend", "data", "db", "WiredTiger.lock");
                try { if (File.Exists(wtLockFile)) File.Delete(wtLockFile); } catch { }
            }
            catch { }
        }

        private static void FreePort(int port)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", string.Format("/c for /f \"tokens=5\" %a in ('netstat -aon 2^>nul ^| findstr /r /c:\":{0} .*LISTENING\"') do taskkill /F /PID %a >nul 2>&1", port))
                {
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process.Start(psi).WaitForExit();
            }
            catch { }
        }
    }
}
