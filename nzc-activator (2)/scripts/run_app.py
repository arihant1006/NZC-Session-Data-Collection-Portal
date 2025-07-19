import subprocess
import sys
import os

def install_requirements():
    """Install required packages"""
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "flask"])
        print("✅ Flask installed successfully")
    except subprocess.CalledProcessError as e:
        print(f"❌ Error installing Flask: {e}")
        return False
    return True

def run_flask_app():
    """Run the Flask application"""
    try:
        # Change to the directory containing app.py
        os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")
        
        # Set Flask environment variables
        os.environ['FLASK_APP'] = 'app.py'
        os.environ['FLASK_ENV'] = 'development'
        
        print("🚀 Starting NZC Activator application...")
        print("📱 Open your browser and go to: http://localhost:5000")
        print("⏹️  Press Ctrl+C to stop the server")
        
        # Run the Flask app
        subprocess.run([sys.executable, "app.py"])
        
    except KeyboardInterrupt:
        print("\n👋 Application stopped")
    except Exception as e:
        print(f"❌ Error running application: {e}")

if __name__ == "__main__":
    print("🔧 Setting up NZC Activator...")
    
    if install_requirements():
        run_flask_app()
    else:
        print("❌ Setup failed. Please install Flask manually: pip install flask")
