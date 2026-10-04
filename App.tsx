import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

type Tab = 'Today' | 'Fridge' | 'Recipes' | 'Tracker' | 'Settings';
const tabs: Tab[] = ['Today', 'Fridge', 'Recipes', 'Tracker', 'Settings'];
const PROFILE_STORAGE_KEY = 'dietdabba.profile.v1';
const SETTINGS_STORAGE_KEY = 'dietdabba.settings.v1';
const DASHBOARD_STORAGE_KEY = 'dietdabba.dashboard.v1';

type ActivityLevel = 'Sedentary' | 'Lightly active' | 'Highly active';
type GoalPace = 'Lose 0.25 kg/week' | 'Lose 0.5 kg/week' | 'Maintain' | 'Build muscle';
type UnitPreference = 'Metric' | 'Imperial';
type ThemePreference = 'System' | 'Light' | 'Dark';
type Routine = { id: string; name: string; time: string; prompt: string; enabled: boolean };

type UserSettings = {
  age: number;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  sex: 'Female' | 'Male' | 'Prefer not to say';
  goalPace: GoalPace;
  activityLevel: ActivityLevel;
  diets: { vegan: boolean; vegetarian: boolean; keto: boolean; dairyFree: boolean };
  excludedFoods: string[];
  proteinPercent: number;
  carbPercent: number;
  fatPercent: number;
  waterGoalMl: number;
  expirationAlertDays: number;
  theme: ThemePreference;
  units: UnitPreference;
  routines: Routine[];
};

type MacroRange = { min: number; max: number };
type AgeBandKey = 'teen' | 'youngAdult' | 'adult' | 'senior';
type NutritionGuidance = {
  ageBand: AgeBandKey;
  ageBandLabel: string;
  calorieMin: number;
  calorieMax: number;
  bodyFatRange: string | null;
  macros: { carbs: MacroRange; protein: MacroRange; fat: MacroRange };
  micronutrients: string[];
  note: string;
};

const defaultSettings: UserSettings = {
  age: 30,
  heightCm: 170,
  currentWeightKg: 70,
  targetWeightKg: 70,
  sex: 'Prefer not to say',
  goalPace: 'Maintain',
  activityLevel: 'Lightly active',
  diets: { vegan: false, vegetarian: false, keto: false, dairyFree: false },
  excludedFoods: [],
  proteinPercent: 30,
  carbPercent: 40,
  fatPercent: 30,
  waterGoalMl: 2500,
  expirationAlertDays: 1,
  theme: 'System',
  units: 'Metric',
  routines: [{ id: 'swim-fuel', name: 'Post-swim fuel', time: '6:30 PM', prompt: 'Have a protein shake after your evening swim.', enabled: true }],
};

const nutritionReference = {
  teen: {
    label: 'Teens (14–18)',
    calories: { Male: [2000, 3200], Female: [1800, 2400] },
    bodyFat: { Male: '10–20%', Female: '18–28%' },
    macros: { carbs: { min: 45, max: 65 }, protein: { min: 10, max: 30 }, fat: { min: 25, max: 35 } },
    micros: { Male: ['Iron', 'Calcium', 'Zinc', 'Magnesium'], Female: ['Iron', 'Calcium', 'Zinc', 'Folate'] },
  },
  youngAdult: {
    label: 'Young adults (19–30)',
    calories: { Male: [2400, 3000], Female: [1800, 2400] },
    bodyFat: { Male: '8–19%', Female: '21–32%' },
    macros: { carbs: { min: 45, max: 65 }, protein: { min: 10, max: 35 }, fat: { min: 20, max: 35 } },
    micros: { Male: ['Magnesium', 'B-vitamins', 'Omega-3s'], Female: ['Iron', 'Folate', 'Magnesium', 'Omega-3s'] },
  },
  adult: {
    label: 'Adults (31–50)',
    calories: { Male: [2200, 3000], Female: [1800, 2200] },
    bodyFat: { Male: '11–21%', Female: '23–33%' },
    macros: { carbs: { min: 45, max: 65 }, protein: { min: 10, max: 35 }, fat: { min: 20, max: 35 } },
    micros: { Male: ['Magnesium', 'Zinc', 'Potassium', 'Vitamin D'], Female: ['Calcium', 'Iron', 'Magnesium', 'Vitamin D'] },
  },
  senior: {
    label: 'Seniors (51+)',
    calories: { Male: [2000, 2800], Female: [1600, 2200] },
    bodyFat: { Male: '13–24%', Female: '24–35%' },
    macros: { carbs: { min: 45, max: 60 }, protein: { min: 15, max: 35 }, fat: { min: 20, max: 30 } },
    micros: { Male: ['Vitamin B12', 'Calcium', 'Vitamin D', 'Protein'], Female: ['Vitamin B12', 'Calcium', 'Vitamin D', 'Protein'] },
  },
} as const;

type TasteLevel = 'Mild' | 'Balanced' | 'Bold';
type ProfileDraft = {
  name: string;
  email: string;
  age: string;
  heightCm: string;
  weightKg: string;
  gender: string;
  city: string;
  country: string;
  sweetness: TasteLevel;
  spice: TasteLevel;
  adventurous: boolean;
  likedFoods: string[];
};

type SavedProfile = Omit<ProfileDraft, 'age' | 'heightCm' | 'weightKg'> & {
  age: number;
  heightCm: number;
  weightKg: number;
};

const emptyProfileDraft: ProfileDraft = {
  name: '', email: '', age: '', heightCm: '', weightKg: '',
  gender: '', city: '', country: '', sweetness: 'Balanced', spice: 'Balanced',
  adventurous: true, likedFoods: [],
};

export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('Today');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [accountStep, setAccountStep] = useState<0 | 1 | 2>(0);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(emptyProfileDraft);
  const [savedProfile, setSavedProfile] = useState<SavedProfile | null>(null);
  const [likedFoodDraft, setLikedFoodDraft] = useState('');
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [settingsReady, setSettingsReady] = useState(false);
  const systemColorScheme = useColorScheme();
  const isDarkTheme = settings.theme === 'Dark' || (settings.theme === 'System' && systemColorScheme === 'dark');

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(PROFILE_STORAGE_KEY), AsyncStorage.getItem(SETTINGS_STORAGE_KEY)])
      .then(([profileValue, settingsValue]) => {
        const loadedProfile = profileValue ? JSON.parse(profileValue) as SavedProfile : null;
        if (loadedProfile) setSavedProfile(loadedProfile);
        if (settingsValue) {
          const loadedSettings = { ...defaultSettings, ...JSON.parse(settingsValue) as Partial<UserSettings> };
          setSettings({ ...loadedSettings, ...normalizeMacroSplit(loadedSettings) });
        } else if (loadedProfile) {
          setSettings((current) => ({
            ...current,
            age: loadedProfile.age,
            heightCm: loadedProfile.heightCm,
            currentWeightKg: loadedProfile.weightKg,
            targetWeightKg: loadedProfile.weightKg,
          }));
        }
        setSettingsReady(true);
      })
      .catch(() => {
        setError('Saved profile settings could not be loaded on this device.');
        setSettingsReady(true);
      });
  }, []);

  useEffect(() => {
    if (settingsReady) AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)).catch(() => setError('Settings could not be saved on this device.'));
  }, [settings, settingsReady]);

  function updateProfile<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setProfileDraft((current) => ({ ...current, [key]: value }));
  }

  async function signIn() {
    if (!email.trim() || !password.trim()) {
      setError('Enter an email and password to continue.');
      return;
    }
    try {
      const storedValue = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
      if (storedValue) {
        const storedProfile = JSON.parse(storedValue) as SavedProfile;
        setSavedProfile(storedProfile.email === email.trim().toLowerCase() ? storedProfile : null);
      }
    } catch {
      setError('Could not load the saved profile. Please try again.');
      return;
    }
    setError('');
    setSignedIn(true);
  }

  function beginAccountCreation() {
    setError('');
    setProfileDraft({ ...emptyProfileDraft });
    setAccountStep(1);
  }

  function continueFromBasics() {
    const age = Number(profileDraft.age);
    const height = Number(profileDraft.heightCm);
    const weight = Number(profileDraft.weightKg);
    if (!profileDraft.name.trim() || !profileDraft.email.trim() || !profileDraft.country.trim()) {
      setError('Name, email, and country are required.');
      return;
    }
    if (!Number.isFinite(age) || age < 13 || age > 120 || !Number.isFinite(height) || height < 80 || height > 250 || !Number.isFinite(weight) || weight < 25 || weight > 350) {
      setError('Check age, height, and weight. Use years, centimeters, and kilograms.');
      return;
    }
    setError('');
    setAccountStep(2);
  }

  async function finishAccountCreation() {
    const profile: SavedProfile = {
      name: profileDraft.name.trim(),
      email: profileDraft.email.trim().toLowerCase(),
      age: Number(profileDraft.age),
      heightCm: Number(profileDraft.heightCm),
      weightKg: Number(profileDraft.weightKg),
      gender: profileDraft.gender,
      city: profileDraft.city.trim(),
      country: profileDraft.country.trim(),
      sweetness: profileDraft.sweetness,
      spice: profileDraft.spice,
      adventurous: profileDraft.adventurous,
      likedFoods: profileDraft.likedFoods,
    };
    try {
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      setSavedProfile(profile);
      setSettings((current) => ({
        ...current,
        age: profile.age,
        heightCm: profile.heightCm,
        currentWeightKg: profile.weightKg,
        targetWeightKg: profile.weightKg,
        sex: profile.gender === 'Man' ? 'Male' : profile.gender === 'Woman' ? 'Female' : current.sex,
      }));
      setError('');
      setSignedIn(true);
      setAccountStep(0);
    } catch {
      setError('Could not save your profile on this device. Please try again.');
    }
  }

  function addLikedFood() {
    const food = likedFoodDraft.trim();
    if (!food || profileDraft.likedFoods.some((item) => item.toLowerCase() === food.toLowerCase())) return;
    updateProfile('likedFoods', [...profileDraft.likedFoods, food]);
    setLikedFoodDraft('');
  }

  async function updateSavedProfile(profile: SavedProfile) {
    setSavedProfile(profile);
    try {
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      setError('Profile changes could not be saved on this device.');
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, signedIn && isDarkTheme && styles.darkRoot]}>
      <StatusBar style={signedIn && isDarkTheme ? 'light' : 'dark'} />
      {signedIn ? (
        <Home activeTab={activeTab} onTabChange={setActiveTab} profile={savedProfile} settings={settings} isDarkTheme={isDarkTheme} onSettingsChange={setSettings} onProfileChange={updateSavedProfile} onProfileCleared={() => setSavedProfile(null)} onSignOut={() => { setSignedIn(false); setActiveTab('Today'); setEmail(''); setPassword(''); setError(''); }} />
      ) : accountStep > 0 ? (
        <Onboarding
          step={accountStep === 2 ? 2 : 1}
          profile={profileDraft}
          error={error}
          likedFoodDraft={likedFoodDraft}
          onChange={updateProfile}
          onLikedFoodDraftChange={setLikedFoodDraft}
          onAddLikedFood={addLikedFood}
          onBack={() => { setError(''); setAccountStep(1); }}
          onContinue={continueFromBasics}
          onFinish={finishAccountCreation}
        />
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.loginScreen}
        >
          <View style={styles.loginHero}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>d</Text></View>
            <Text style={styles.brandName}>dietdabba</Text>
            <Text style={styles.heroTitle}>Good food starts{'\n'}with what you have.</Text>
            <Text style={styles.heroCopy}>Your fridge, your goals, your kind of meal.</Text>
            <View style={styles.heroStats}>
              <Text style={styles.heroStat}>●  Know your food</Text>
              <Text style={styles.heroStat}>●  Eat your way</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.loginForm} keyboardShouldPersistTaps="handled">
            <Text style={styles.eyebrow}>YOUR KITCHEN, IN SYNC</Text>
            <Text style={styles.formTitle}>Welcome back</Text>
            <Text style={styles.formSubtitle}>Sign in to pick up where you left off.</Text>
            <Text style={styles.fieldLabel}>Email address</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={email}
            />
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={setPassword}
              onSubmitEditing={signIn}
              placeholder="Enter your password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
              value={password}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable onPress={signIn} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Sign in</Text><Text style={styles.buttonArrow}>→</Text>
            </Pressable>
            <Pressable onPress={() => { setEmail('hello@dietdabba.app'); setPassword('demo'); setError(''); }}>
              <Text style={styles.demoLink}>Try the demo account</Text>
            </Pressable>
            <View style={styles.accountNoteRow}><Text style={styles.accountNote}>New here? </Text><Pressable onPress={beginAccountCreation}><Text style={styles.accountLink}>Create an account</Text></Pressable></View>
            <Text style={styles.localNote}>Demo sign-in only · no account is created</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Onboarding({ step, profile, error, likedFoodDraft, onChange, onLikedFoodDraftChange, onAddLikedFood, onBack, onContinue, onFinish }: {
  step: 1 | 2;
  profile: ProfileDraft;
  error: string;
  likedFoodDraft: string;
  onChange: <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => void;
  onLikedFoodDraftChange: (value: string) => void;
  onAddLikedFood: () => void;
  onBack: () => void;
  onContinue: () => void;
  onFinish: () => void;
}) {
  const tasteLevels: TasteLevel[] = ['Mild', 'Balanced', 'Bold'];
  const genders = ['Woman', 'Man', 'Non-binary', 'Prefer not to say'];
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.onboardingScreen}>
      <View style={styles.onboardingHeader}>
        <View style={styles.onboardingBrand}><View style={styles.brandMark}><Text style={styles.brandMarkText}>d</Text></View><Text style={styles.brandNameDark}>dietdabba</Text></View>
        <Text style={styles.stepCount}>STEP {step} OF 2</Text>
      </View>
      <View style={styles.stepTrack}><View style={[styles.stepTrackFill, step === 2 && styles.stepTrackComplete]} /></View>
      <ScrollView contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <>
            <Text style={styles.eyebrow}>LET'S MAKE THIS PERSONAL</Text>
            <Text style={styles.onboardingTitle}>A little about you.</Text>
            <Text style={styles.onboardingSubtitle}>Your details help us tailor nutrition estimates and find food that's familiar where you live.</Text>
            <Text style={styles.prototypeNote}>Prototype setup: your profile is stored on this device. Secure online account sign-in will be connected later.</Text>
            <Text style={styles.fieldLabel}>Your name</Text>
            <TextInput autoComplete="name" onChangeText={(value) => onChange('name', value)} placeholder="Name" placeholderTextColor={colors.muted} style={styles.input} value={profile.name} />
            <Text style={styles.fieldLabel}>Email address</Text>
            <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={(value) => onChange('email', value)} placeholder="you@example.com" placeholderTextColor={colors.muted} style={styles.input} value={profile.email} />
            <View style={styles.fieldColumns}>
              <View style={styles.fieldColumn}><Text style={styles.fieldLabel}>Age</Text><TextInput keyboardType="number-pad" onChangeText={(value) => onChange('age', value)} placeholder="Years" placeholderTextColor={colors.muted} style={styles.input} value={profile.age} /></View>
              <View style={styles.fieldColumn}><Text style={styles.fieldLabel}>Gender <Text style={styles.optionalLabel}>optional</Text></Text><Text style={styles.genderSummary}>{profile.gender || 'Choose below'}</Text></View>
            </View>
            <View style={styles.choiceWrap}>
              {genders.map((gender) => (
                <Pressable key={gender} onPress={() => onChange('gender', gender)} style={[styles.choiceChip, profile.gender === gender && styles.choiceChipSelected]}>
                  <Text style={[styles.choiceChipText, profile.gender === gender && styles.choiceChipTextSelected]}>{gender}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.fieldColumns}>
              <View style={styles.fieldColumn}><Text style={styles.fieldLabel}>Height <Text style={styles.optionalLabel}>cm</Text></Text><TextInput keyboardType="number-pad" onChangeText={(value) => onChange('heightCm', value)} placeholder="170" placeholderTextColor={colors.muted} style={styles.input} value={profile.heightCm} /></View>
              <View style={styles.fieldColumn}><Text style={styles.fieldLabel}>Weight <Text style={styles.optionalLabel}>kg</Text></Text><TextInput keyboardType="decimal-pad" onChangeText={(value) => onChange('weightKg', value)} placeholder="70" placeholderTextColor={colors.muted} style={styles.input} value={profile.weightKg} /></View>
            </View>
            <View style={styles.fieldColumns}>
              <View style={styles.fieldColumn}><Text style={styles.fieldLabel}>City <Text style={styles.optionalLabel}>optional</Text></Text><TextInput autoCapitalize="words" onChangeText={(value) => onChange('city', value)} placeholder="City" placeholderTextColor={colors.muted} style={styles.input} value={profile.city} /></View>
              <View style={styles.fieldColumn}><Text style={styles.fieldLabel}>Country / region</Text><TextInput autoCapitalize="words" onChangeText={(value) => onChange('country', value)} placeholder="Country" placeholderTextColor={colors.muted} style={styles.input} value={profile.country} /></View>
            </View>
            <Text style={styles.privacyNote}>Age, height, and weight help estimate daily nutrition needs. These estimates aren't medical advice.</Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable onPress={onContinue} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Continue to taste preferences</Text><Text style={styles.buttonArrow}>→</Text></Pressable>
            <Pressable onPress={onBack}><Text style={styles.backToLogin}>Back to sign in</Text></Pressable>
          </>
        ) : (
          <>
            <Text style={styles.eyebrow}>YOUR TASTE, YOUR RULES</Text>
            <Text style={styles.onboardingTitle}>What do you enjoy?</Text>
            <Text style={styles.onboardingSubtitle}>We'll start with what you already love, then suggest related foods to explore.</Text>
            <Text style={styles.preferenceLabel}>How sweet do you like it?</Text>
            <View style={styles.preferenceChoices}>{tasteLevels.map((level) => <Pressable key={level} onPress={() => onChange('sweetness', level)} style={[styles.preferenceChoice, profile.sweetness === level && styles.preferenceChoiceSelected]}><Text style={styles.preferenceEmoji}>{level === 'Mild' ? '🍋' : level === 'Balanced' ? '🍑' : '🍯'}</Text><Text style={[styles.preferenceChoiceText, profile.sweetness === level && styles.preferenceChoiceTextSelected]}>{level}</Text></Pressable>)}</View>
            <Text style={styles.preferenceLabel}>What about spice?</Text>
            <View style={styles.preferenceChoices}>{tasteLevels.map((level) => <Pressable key={level} onPress={() => onChange('spice', level)} style={[styles.preferenceChoice, profile.spice === level && styles.preferenceChoiceSelected]}><Text style={styles.preferenceEmoji}>{level === 'Mild' ? '🫑' : level === 'Balanced' ? '🌶️' : '🔥'}</Text><Text style={[styles.preferenceChoiceText, profile.spice === level && styles.preferenceChoiceTextSelected]}>{level}</Text></Pressable>)}</View>
            <Pressable onPress={() => onChange('adventurous', !profile.adventurous)} style={styles.adventureToggle}>
              <View style={styles.adventureCopy}><Text style={styles.preferenceLabel}>Fancy trying something new?</Text><Text style={styles.adventureHint}>We'll mix in a few discoveries related to your favourites.</Text></View>
              <View style={[styles.toggleTrack, profile.adventurous && styles.toggleTrackOn]}><View style={[styles.toggleThumb, profile.adventurous && styles.toggleThumbOn]} /></View>
            </Pressable>
            <Text style={styles.preferenceLabel}>Foods you already love</Text>
            <Text style={styles.adventureHint}>Add a few favourites; we'll look for related ingredients and recipes.</Text>
            <View style={styles.addFoodRow}><TextInput onChangeText={onLikedFoodDraftChange} onSubmitEditing={onAddLikedFood} placeholder="e.g. mango, paneer, ramen" placeholderTextColor={colors.muted} returnKeyType="done" style={[styles.input, styles.likedFoodInput]} value={likedFoodDraft} /><Pressable onPress={onAddLikedFood} style={styles.addIngredientButton}><Text style={styles.addIngredientButtonText}>Add</Text></Pressable></View>
            <View style={styles.likedFoodTags}>{profile.likedFoods.map((food) => <Pressable key={food} onPress={() => onChange('likedFoods', profile.likedFoods.filter((item) => item !== food))} style={styles.likedFoodTag}><Text style={styles.likedFoodTagText}>{food}  ×</Text></Pressable>)}</View>
            {profile.likedFoods.length === 0 ? <Text style={styles.foodEmptyHint}>No favourites added yet. This is optional.</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable onPress={onFinish} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Save preferences & continue</Text><Text style={styles.buttonArrow}>→</Text></Pressable>
            <Pressable onPress={onBack}><Text style={styles.backToLogin}>← Back to personal details</Text></Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Home({ activeTab, onTabChange, profile, settings, isDarkTheme, onSettingsChange, onProfileChange, onProfileCleared, onSignOut }: { activeTab: Tab; onTabChange: (tab: Tab) => void; profile: SavedProfile | null; settings: UserSettings; isDarkTheme: boolean; onSettingsChange: (settings: UserSettings) => void; onProfileChange: (profile: SavedProfile) => void; onProfileCleared: () => void; onSignOut: () => void }) {
  const [inventory, setInventory] = useState(initialInventory);
  const [calories, setCalories] = useState(1240);
  const [protein, setProtein] = useState(62);
  const [sugar, setSugar] = useState(18);
  const [waterMl, setWaterMl] = useState(1500);
  const [mealCounts, setMealCounts] = useState<Record<MealName, number>>({ Breakfast: 1, Lunch: 1, Dinner: 0, Snacks: 1 });
  const [micronutrientsDone, setMicronutrientsDone] = useState<string[]>([]);
  const [ingredientDraft, setIngredientDraft] = useState('');
  const [showMealLog, setShowMealLog] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealName>('Breakfast');
  const [notice, setNotice] = useState('');
  const [dashboardReady, setDashboardReady] = useState(false);
  const calorieGoal = calculateCalorieGoal(settings);
  const remainingCalories = Math.max(0, calorieGoal - calories);
  const expiringCount = inventory.filter((item) => item.expiresInHours !== undefined && item.expiresInHours <= settings.expirationAlertDays * 24).length;
  const todayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();

  useEffect(() => {
    AsyncStorage.getItem(DASHBOARD_STORAGE_KEY)
      .then((value) => {
        if (value) {
          const saved = JSON.parse(value) as { dateKey: string; inventory: InventoryItem[]; calories: number; protein: number; sugar: number; waterMl: number; mealCounts: Record<MealName, number>; micronutrientsDone?: string[] };
          if (saved.dateKey === getLocalDateKey()) {
            setInventory(saved.inventory);
            setCalories(saved.calories);
            setProtein(saved.protein);
            setSugar(saved.sugar);
            setWaterMl(saved.waterMl);
            setMealCounts(saved.mealCounts);
            setMicronutrientsDone(saved.micronutrientsDone ?? []);
          }
        }
        setDashboardReady(true);
      })
      .catch(() => setDashboardReady(true));
  }, []);

  useEffect(() => {
    if (dashboardReady) {
      AsyncStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify({ dateKey: getLocalDateKey(), inventory, calories, protein, sugar, waterMl, mealCounts, micronutrientsDone }))
        .catch(() => setNotice('Daily data could not be saved on this device.'));
    }
  }, [dashboardReady, inventory, calories, protein, sugar, waterMl, mealCounts, micronutrientsDone]);

  function openMealLog(meal: MealName = 'Breakfast') {
    setSelectedMeal(meal);
    setShowMealLog(true);
  }

  function logMeal() {
    setCalories((current) => current + 250);
    setProtein((current) => current + 15);
    setSugar((current) => current + 4);
    setMealCounts((current) => ({ ...current, [selectedMeal]: current[selectedMeal] + 1 }));
    setNotice(`${selectedMeal} added to today's tracker.`);
    setShowMealLog(false);
  }

  function logAndCook(recipe: Recipe) {
    const missingIngredients = recipe.ingredients.filter((ingredient) => !inventory.some((item) => item.name === ingredient && item.quantity > 0));
    if (missingIngredients.length > 0) {
      setNotice(`Not enough ingredients: ${missingIngredients.join(', ')}.`);
      return;
    }
    setInventory((current) => current
      .map((item) => recipe.ingredients.includes(item.name) ? { ...item, quantity: item.quantity - 1 } : item)
      .filter((item) => item.quantity > 0));
    setCalories((current) => current + recipe.calories);
    setProtein((current) => current + recipe.protein);
    setSugar((current) => current + recipe.sugar);
    setMealCounts((current) => ({ ...current, Dinner: current.Dinner + 1 }));
    setNotice(`${recipe.name} cooked, logged, and removed from your fridge.`);
  }

  function addIngredient() {
    const name = ingredientDraft.trim();
    if (!name) return;
    setInventory((current) => {
      const existingItem = current.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (existingItem) {
        return current.map((item) => item === existingItem ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...current, { name, quantity: 1 }];
    });
    setIngredientDraft('');
    setNotice(`${name} added to your fridge.`);
  }

  function adjustIngredient(name: string, delta: number) {
    setInventory((current) => current
      .map((item) => item.name === name ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0));
  }

  function removeIngredient(name: string) {
    setInventory((current) => current.filter((item) => item.name !== name));
    setNotice(`${name} removed from your fridge.`);
  }

  function toggleMicronutrient(nutrient: string) {
    setMicronutrientsDone((current) => current.includes(nutrient) ? current.filter((item) => item !== nutrient) : [...current, nutrient]);
  }

  function persistSettings(nextSettings: UserSettings) {
    onSettingsChange(nextSettings);
    if (profile) {
      onProfileChange({ ...profile, age: nextSettings.age, heightCm: nextSettings.heightCm, weightKg: nextSettings.currentWeightKg });
    }
  }

  async function clearAllTestData() {
    try {
      await AsyncStorage.multiRemove([PROFILE_STORAGE_KEY, SETTINGS_STORAGE_KEY, DASHBOARD_STORAGE_KEY]);
    } catch {
      setNotice('Could not clear the saved profile. Please try again.');
      return;
    }
    setInventory([]);
    setCalories(0);
    setProtein(0);
    setSugar(0);
    setWaterMl(0);
    setMealCounts({ Breakfast: 0, Lunch: 0, Dinner: 0, Snacks: 0 });
    setMicronutrientsDone([]);
    onSettingsChange(defaultSettings);
    onProfileCleared();
    setNotice('All local test data and saved profile cleared. Add ingredients or log a meal to begin.');
  }

  function restoreDemoData() {
    setInventory(initialInventory.map((item) => ({ ...item })));
    setCalories(1240);
    setProtein(62);
    setSugar(18);
    setWaterMl(1500);
    setMealCounts({ Breakfast: 1, Lunch: 1, Dinner: 0, Snacks: 1 });
    setMicronutrientsDone([]);
    setNotice('Demo data restored.');
  }

  return (
    <View style={[styles.homeScreen, isDarkTheme && styles.darkHome]}>
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <View style={styles.homeHeader}>
          <View>
            <Text style={[styles.dateLabel, isDarkTheme && styles.darkSecondaryText]}>{todayLabel}</Text>
            <Text style={[styles.greeting, isDarkTheme && styles.darkPrimaryText]}>A good day to eat well.</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => openMealLog()} style={styles.headerLogButton}>
              <Text style={styles.headerLogPlus}>+</Text><Text style={styles.headerLogText}>Log meal</Text>
            </Pressable>
            <View style={styles.streakBadge}><Text style={styles.streakText}>🔥 5 day streak</Text></View>
            <Pressable onPress={() => onTabChange('Settings')} style={styles.avatar}><Text style={styles.avatarText}>{profile?.name.slice(0, 1).toUpperCase() ?? 'A'}</Text></Pressable>
          </View>
        </View>
        {activeTab === 'Today' ? (
          <Today
            inventory={inventory}
            profile={profile}
            calories={calories}
            protein={protein}
            sugar={sugar}
            remainingCalories={remainingCalories}
            calorieGoal={calorieGoal}
            expiringCount={expiringCount}
            waterMl={waterMl}
            waterGoalMl={settings.waterGoalMl}
            mealCounts={mealCounts}
            notice={notice}
            onChangeWater={(delta) => setWaterMl((current) => Math.max(0, current + delta))}
            onOpenMealLog={openMealLog}
            onLogAndCook={logAndCook}
            onClearNotice={() => setNotice('')}
            onOpenFridge={() => onTabChange('Fridge')}
            onOpenSettings={() => onTabChange('Settings')}
            onOpenRecipes={() => onTabChange('Recipes')}
            settings={settings}
            isDarkTheme={isDarkTheme}
          />
        ) : (
          <TabPage
            tab={activeTab}
            inventory={inventory}
            calories={calories}
            protein={protein}
            sugar={sugar}
            micronutrientsDone={micronutrientsDone}
            onToggleMicronutrient={toggleMicronutrient}
            ingredientDraft={ingredientDraft}
            onIngredientDraftChange={setIngredientDraft}
            onAddIngredient={addIngredient}
            onAdjustIngredient={adjustIngredient}
            onRemoveIngredient={removeIngredient}
            onClearAllData={clearAllTestData}
            onRestoreDemoData={restoreDemoData}
            profile={profile}
            settings={settings}
            onSettingsChange={persistSettings}
            onProfileChange={onProfileChange}
            onSignOut={onSignOut}
            onOpenSettings={() => onTabChange('Settings')}
            onLogAndCook={logAndCook}
            isDarkTheme={isDarkTheme}
          />
        )}
      </ScrollView>
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable key={tab} onPress={() => onTabChange(tab)} style={styles.tabButton}>
            <View style={[styles.tabDot, activeTab === tab && styles.activeTabDot]} />
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </Pressable>
        ))}
      </View>
      <MealLogModal
        visible={showMealLog}
        selectedMeal={selectedMeal}
        onSelectMeal={setSelectedMeal}
        onClose={() => setShowMealLog(false)}
        onLog={logMeal}
      />
    </View>
  );
}

type MealName = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';
type InventoryItem = { name: string; quantity: number; expiresInHours?: number };
type Recipe = { name: string; emoji: string; tag: string; detail: string; ingredients: string[]; calories: number; protein: number; sugar: number; carbs: number; color: string };

const initialInventory: InventoryItem[] = [
  { name: 'Spinach', quantity: 1, expiresInHours: 18 },
  { name: 'Chickpeas', quantity: 1 },
  { name: 'Greek yogurt', quantity: 1 },
  { name: 'Avocado', quantity: 1, expiresInHours: 22 },
  { name: 'Eggs', quantity: 1 },
  { name: 'Tomatoes', quantity: 1 },
  { name: 'Sourdough', quantity: 1 },
  { name: 'Cucumber', quantity: 1 },
  { name: 'Quinoa', quantity: 1 },
  { name: 'Chicken', quantity: 1 },
  { name: 'Lemons', quantity: 1 },
  { name: 'Oats', quantity: 1 },
];

const recipes: Recipe[] = [
  { name: 'Green goddess chickpea bowl', emoji: '🥑', tag: '25 MIN · HIGH PROTEIN', detail: 'Uses 4 things you have', ingredients: ['Spinach', 'Chickpeas', 'Greek yogurt', 'Avocado'], calories: 420, protein: 24, sugar: 5, carbs: 42, color: '#E9C96D' },
  { name: 'Tomato & egg toast', emoji: '🍳', tag: '15 MIN · EASY LUNCH', detail: 'Uses 3 things you have', ingredients: ['Eggs', 'Tomatoes', 'Sourdough'], calories: 360, protein: 19, sugar: 6, carbs: 38, color: '#E38A68' },
  { name: 'Cucumber yogurt bowl', emoji: '🥒', tag: '10 MIN · FRESH & LIGHT', detail: 'Uses 3 things you have', ingredients: ['Cucumber', 'Greek yogurt', 'Lemons'], calories: 290, protein: 17, sugar: 7, carbs: 16, color: '#B6CE9B' },
];

const relatedFoodMap: Record<string, string[]> = {
  mango: ['Papaya', 'Pineapple', 'Peach'],
  paneer: ['Tofu', 'Halloumi', 'Cottage cheese'],
  ramen: ['Udon', 'Soba', 'Rice noodles'],
  chickpeas: ['Lentils', 'Edamame', 'White beans'],
  avocado: ['Edamame', 'Green peas', 'Pistachio'],
  berries: ['Cherries', 'Peaches', 'Plums'],
  pizza: ['Flatbread', 'Roasted peppers', 'Basil'],
};

function getNutritionGuidance(settings: UserSettings): NutritionGuidance {
  const ageBand: AgeBandKey = settings.age <= 18 ? 'teen' : settings.age <= 30 ? 'youngAdult' : settings.age <= 50 ? 'adult' : 'senior';
  const reference = nutritionReference[ageBand];
  const isMale = settings.sex === 'Male';
  const isFemale = settings.sex === 'Female';
  const maleCalories = reference.calories.Male;
  const femaleCalories = reference.calories.Female;
  const calorieMin = isMale ? maleCalories[0] : isFemale ? femaleCalories[0] : Math.round((maleCalories[0] + femaleCalories[0]) / 2 / 100) * 100;
  const calorieMax = isMale ? maleCalories[1] : isFemale ? femaleCalories[1] : Math.round((maleCalories[1] + femaleCalories[1]) / 2 / 100) * 100;
  const micronutrients = isMale ? [...reference.micros.Male] : isFemale ? [...reference.micros.Female] : [...new Set([...reference.micros.Male, ...reference.micros.Female])];
  const bodyFatRange = isMale ? reference.bodyFat.Male : isFemale ? reference.bodyFat.Female : null;
  const note = settings.age < 14
    ? 'The supplied reference starts at age 14; the 14–18 band is shown as the nearest reference and should be reviewed with a qualified clinician.'
    : settings.age < 18
      ? 'Teen nutrition needs vary with growth and development. Treat these values as broad references, not weight-loss prescriptions.'
      : 'These user-provided population ranges are general references, not an individualized medical recommendation.';
  return { ageBand, ageBandLabel: reference.label, calorieMin, calorieMax, bodyFatRange, macros: reference.macros, micronutrients, note };
}

function calculateCalorieGoal(settings: UserSettings): number {
  const guidance = getNutritionGuidance(settings);
  const activityBase = settings.activityLevel === 'Sedentary'
    ? guidance.calorieMin
    : settings.activityLevel === 'Highly active'
      ? guidance.calorieMax
      : Math.round((guidance.calorieMin + guidance.calorieMax) / 100) * 50;
  const paceAdjustment = settings.age < 18
    ? 0
    : settings.goalPace === 'Lose 0.25 kg/week'
      ? -275
      : settings.goalPace === 'Lose 0.5 kg/week'
        ? -550
        : settings.goalPace === 'Build muscle'
          ? 250
          : 0;
  const adjustedTarget = Math.round((activityBase + paceAdjustment) / 50) * 50;
  return Math.min(guidance.calorieMax, Math.max(guidance.calorieMin, adjustedTarget));
}

function normalizeMacroSplit(settings: UserSettings): Pick<UserSettings, 'proteinPercent' | 'carbPercent' | 'fatPercent'> {
  const limits = getNutritionGuidance(settings).macros;
  const macros = {
    proteinPercent: Math.max(limits.protein.min, Math.min(limits.protein.max, settings.proteinPercent)),
    carbPercent: Math.max(limits.carbs.min, Math.min(limits.carbs.max, settings.carbPercent)),
    fatPercent: Math.max(limits.fat.min, Math.min(limits.fat.max, settings.fatPercent)),
  };
  let remainder = 100 - macros.proteinPercent - macros.carbPercent - macros.fatPercent;
  const keys = ['carbPercent', 'proteinPercent', 'fatPercent'] as const;
  for (const key of keys) {
    const range = key === 'carbPercent' ? limits.carbs : key === 'proteinPercent' ? limits.protein : limits.fat;
    const amount = Math.min(Math.max(remainder, range.min - macros[key]), range.max - macros[key]);
    macros[key] += amount;
    remainder -= amount;
  }
  return macros;
}

function recipeMatchesPreferences(recipe: Recipe, settings: UserSettings): boolean {
  const ingredientText = recipe.ingredients.join(' ').toLowerCase();
  const hasDairy = recipe.ingredients.some((ingredient) => /yogurt|cheese|milk/i.test(ingredient));
  const hasMeat = recipe.ingredients.some((ingredient) => /chicken|beef|pork|fish|tuna/i.test(ingredient));
  const veganExcluded = /egg|honey/i.test(ingredientText);
  const explicitlyExcluded = settings.excludedFoods.some((food) => ingredientText.includes(food.toLowerCase()));
  if (settings.diets.vegan && (hasDairy || hasMeat || veganExcluded)) return false;
  if (settings.diets.vegetarian && hasMeat) return false;
  if (settings.diets.keto && recipe.carbs > 20) return false;
  if (settings.diets.dairyFree && hasDairy) return false;
  return !explicitlyExcluded;
}

function getLocalDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatWater(ml: number, units: UnitPreference): string {
  return units === 'Metric' ? `${(ml / 1000).toFixed(2).replace(/\.?0+$/, '')} L` : `${Math.round(ml / 29.5735)} oz`;
}

function Today({
  inventory,
  profile,
  calories,
  protein,
  sugar,
  remainingCalories,
  calorieGoal,
  expiringCount,
  waterMl,
  waterGoalMl,
  mealCounts,
  notice,
  settings,
  onChangeWater,
  onOpenMealLog,
  onLogAndCook,
  onClearNotice,
  onOpenFridge,
  onOpenSettings,
  onOpenRecipes,
  isDarkTheme,
}: {
  inventory: InventoryItem[];
  profile: SavedProfile | null;
  settings: UserSettings;
  calories: number;
  protein: number;
  sugar: number;
  remainingCalories: number;
  calorieGoal: number;
  expiringCount: number;
  waterMl: number;
  waterGoalMl: number;
  mealCounts: Record<MealName, number>;
  notice: string;
  onChangeWater: (delta: number) => void;
  onOpenMealLog: (meal?: MealName) => void;
  onLogAndCook: (recipe: Recipe) => void;
  onClearNotice: () => void;
  onOpenFridge: () => void;
  onOpenSettings: () => void;
  onOpenRecipes: () => void;
  isDarkTheme: boolean;
}) {
  const inventoryCount = inventory.reduce((total, item) => total + item.quantity, 0);
  const waterProgress = Math.min((waterMl / waterGoalMl) * 100, 100);
  const relatedFoods = profile?.likedFoods.flatMap((food) => relatedFoodMap[food.toLowerCase()] ?? []).filter((food, index, all) => all.indexOf(food) === index).slice(0, 4) ?? [];
  const favoriteAnchor = profile?.likedFoods[0];

  return (
    <>
      <View style={styles.fridgeBanner}>
        <View style={styles.bannerTopline}>
          <Text style={styles.bannerEyebrow}>YOUR FRIDGE</Text>
          <Pressable onPress={onOpenFridge}><Text style={styles.bannerArrow}>↗</Text></Pressable>
        </View>
        <Text style={styles.fridgeCount}>{inventoryCount} <Text style={styles.fridgeCountUnit}>items on hand</Text></Text>
        {expiringCount > 0 ? <View style={styles.expirationBadge}><Text style={styles.expirationText}>⚠  {expiringCount} items expiring within {settings.expirationAlertDays} {settings.expirationAlertDays === 1 ? 'day' : 'days'}</Text></View> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ingredientPills}>
          {inventory.slice(0, 4).map((item) => <View key={item.name} style={styles.ingredientPill}><Text style={styles.ingredientPillText}>{item.name}</Text></View>)}
          {inventory.length === 0 ? <Text style={styles.bannerDetail}>Your fridge is clear. Add ingredients to restock.</Text> : null}
        </ScrollView>
        <View style={styles.bannerBottom}>
          <Text style={styles.bannerDetail}>{expiringCount > 0 ? `${expiringCount} items ready to use today` : 'No ingredients expiring soon'}</Text>
          <Pressable onPress={onOpenFridge} style={styles.smallPill}><Text style={styles.smallPillText}>View fridge</Text></Pressable>
        </View>
      </View>
      <View style={styles.sectionHeading}>
        <View><Text style={[styles.eyebrow, isDarkTheme && styles.darkEyebrow]}>YOUR DAILY TRACKER</Text><Text style={[styles.sectionTitle, isDarkTheme && styles.darkPrimaryText]}>A little progress</Text></View>
        <Pressable onPress={onOpenSettings}><Text style={styles.actionText}>Edit goals</Text></Pressable>
      </View>
      <View style={styles.nutritionPanel}>
        <View style={styles.calorieSummary}>
          <View><Text style={styles.calorieKicker}>REMAINING CALORIES</Text><Text style={styles.calorieValue}>{remainingCalories.toLocaleString()} <Text style={styles.calorieUnit}>kcal left</Text></Text></View>
          <View style={styles.calorieConsumed}><Text style={styles.consumedNumber}>{calories.toLocaleString()}</Text><Text style={styles.consumedLabel}>of {calorieGoal.toLocaleString()} kcal</Text></View>
        </View>
        <NutritionRow label="Protein" current={`${protein}`} target={`${Math.round(calorieGoal * settings.proteinPercent / 100 / 4)} g`} progress={Math.min((protein / (calorieGoal * settings.proteinPercent / 100 / 4)) * 100, 100)} tint={colors.green} />
        <NutritionRow label="Added sugar" current={`${sugar}`} target="30 g max" progress={Math.min((sugar / 30) * 100, 100)} tint={colors.coral} />
        <NutritionRow label="Energy" current={calories.toLocaleString()} target={`${calorieGoal.toLocaleString()} kcal`} progress={Math.min((calories / calorieGoal) * 100, 100)} tint={colors.yellow} last />
      </View>
      <View style={styles.mealSlots}>
        {(['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as MealName[]).map((meal) => (
          <Pressable key={meal} onPress={() => onOpenMealLog(meal)} style={styles.mealSlot}>
            <View style={[styles.mealPlus, mealCounts[meal] > 0 && styles.mealLogged]}><Text style={styles.mealPlusText}>{mealCounts[meal] > 0 ? '✓' : '+'}</Text></View>
            <Text style={styles.mealSlotLabel}>{meal}</Text>
            <Text style={styles.mealSlotCount}>{mealCounts[meal] > 0 ? `${mealCounts[meal]} logged` : 'Add meal'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.sectionHeading}>
        <View><Text style={[styles.eyebrow, isDarkTheme && styles.darkEyebrow]}>MADE FOR YOUR FRIDGE</Text><Text style={[styles.sectionTitle, isDarkTheme && styles.darkPrimaryText]}>Tonight, perhaps?</Text></View>
        <Pressable onPress={onOpenRecipes}><Text style={styles.actionText}>See all →</Text></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipeCarousel}>
        {recipes.filter((recipe) => recipeMatchesPreferences(recipe, settings)).map((recipe) => {
          const missingIngredients = recipe.ingredients.filter((ingredient) => !inventory.some((item) => item.name === ingredient && item.quantity > 0));
          const canCook = missingIngredients.length === 0;
          return (
            <View key={recipe.name} style={styles.recipeCard}>
              <View style={[styles.recipeArt, { backgroundColor: recipe.color }]}><Text style={styles.recipeEmoji}>{recipe.emoji}</Text><Text style={styles.recipeCardArrow}>↗</Text></View>
              <View style={styles.recipeInfo}>
                <Text style={styles.recipeTag}>{recipe.tag}</Text>
                <Text style={styles.recipeName}>{recipe.name}</Text>
                <Text style={styles.recipeDetail}>{canCook ? recipe.detail : `Needs ${missingIngredients.join(', ')}`}</Text>
                <View style={styles.recipeFacts}><Text style={styles.recipeFact}>{recipe.calories} kcal</Text><Text style={styles.recipeFact}>{recipe.protein}g protein</Text></View>
                <Pressable disabled={!canCook} onPress={() => onLogAndCook(recipe)} style={[styles.cookButton, !canCook && styles.cookButtonDisabled]}>
                  <Text style={styles.cookButtonText}>{canCook ? 'Log & Cook' : 'Missing ingredients'}</Text>{canCook ? <Text style={styles.cookButtonPlus}>+</Text> : null}
                </Pressable>
              </View>
            </View>
          );
        })}
        {!recipes.some((recipe) => recipeMatchesPreferences(recipe, settings)) ? <Text style={styles.noRecipeCard}>No sample recipes match these diet filters. Adjust them in Settings.</Text> : null}
      </ScrollView>
      <View style={styles.relatedFoodsPanel}>
        <View style={styles.relatedFoodsHeading}><View><Text style={styles.eyebrow}>A LITTLE OUTSIDE YOUR USUAL</Text><Text style={styles.relatedFoodsTitle}>{favoriteAnchor ? `Because you like ${favoriteAnchor}` : 'Discover related foods'}</Text></View><Text style={styles.discoveryMark}>✳</Text></View>
        {relatedFoods.length > 0 ? (
          <View style={styles.relatedFoodTags}>{relatedFoods.map((food) => <View key={food} style={styles.relatedFoodTag}><Text style={styles.relatedFoodText}>{food}</Text></View>)}</View>
        ) : (
          <Text style={styles.relatedFoodsCopy}>{profile?.likedFoods.length ? `Your ${profile.spice.toLowerCase()} spice and ${profile.sweetness.toLowerCase()} sweetness preferences are saved. Add more favourites for closer matches.` : 'Add a few favourite foods in Profile and we’ll suggest related ingredients to try.'}</Text>
        )}
      </View>
      <View style={styles.bottomWidgets}>
        <View style={styles.widgetPanel}>
          <View style={styles.widgetHeading}><View><Text style={styles.eyebrow}>HYDRATION</Text><Text style={styles.widgetTitle}>Water check</Text></View><Text style={styles.waterDrop}>◉</Text></View>
          <View style={styles.waterNumbers}><Text style={styles.waterCurrent}>{formatWater(waterMl, settings.units)}</Text><Text style={styles.waterTarget}>/ {formatWater(waterGoalMl, settings.units)}</Text></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${waterProgress}%`, backgroundColor: '#6DA9B1' }]} /></View>
          <View style={styles.waterActions}>
            <Pressable onPress={() => onChangeWater(-250)} disabled={waterMl === 0} style={[styles.waterStepButton, waterMl === 0 && styles.waterStepDisabled]}><Text style={styles.waterStepText}>− 250 ml</Text></Pressable>
            <Pressable onPress={() => onChangeWater(250)} style={styles.waterAddButton}><Text style={styles.waterAddText}>+ 250 ml</Text></Pressable>
          </View>
        </View>
        <View style={styles.routinePanel}>
          {settings.routines.filter((routine) => routine.enabled).length ? settings.routines.filter((routine) => routine.enabled).slice(0, 1).map((routine) => (
            <View key={routine.id}>
              <Text style={styles.eyebrow}>COMING UP · {routine.time}</Text>
              <Text style={styles.routineTitle}>{routine.name}</Text>
              <Text style={styles.routineBody}>{routine.prompt}</Text>
              <Text style={styles.routineTag}>ROUTINE REMINDER</Text>
            </View>
          )) : <View><Text style={styles.eyebrow}>ROUTINES</Text><Text style={styles.routineTitle}>No reminders scheduled</Text><Text style={styles.routineBody}>Add a daily activity and meal prompt in Settings.</Text></View>}
          <Pressable onPress={onOpenSettings} style={styles.routineSettings}><Text style={styles.routineSettingsText}>Manage routines →</Text></Pressable>
        </View>
      </View>
      {notice ? <Pressable onPress={onClearNotice} style={styles.noticeToast}><Text style={styles.noticeText}>{notice}</Text><Text style={styles.noticeDismiss}>×</Text></Pressable> : null}
    </>
  );
}

function MealLogModal({ visible, selectedMeal, onSelectMeal, onClose, onLog }: { visible: boolean; selectedMeal: MealName; onSelectMeal: (meal: MealName) => void; onClose: () => void; onLog: () => void }) {
  const mealOptions: { name: MealName; emoji: string }[] = [
    { name: 'Breakfast', emoji: '☀' },
    { name: 'Lunch', emoji: '◒' },
    { name: 'Dinner', emoji: '◐' },
    { name: 'Snacks', emoji: '✳' },
  ];
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalShade}>
        <View style={styles.mealModal}>
          <View style={styles.modalHandle} />
          <View style={styles.modalTitleRow}><View><Text style={styles.eyebrow}>QUICK ADD</Text><Text style={styles.modalTitle}>Log a meal</Text></View><Pressable onPress={onClose} style={styles.closeButton}><Text style={styles.closeButtonText}>×</Text></Pressable></View>
          <Text style={styles.modalCopy}>Choose a meal slot. You can edit nutrition details later.</Text>
          <View style={styles.mealOptionGrid}>
            {mealOptions.map((meal) => (
              <Pressable key={meal.name} onPress={() => onSelectMeal(meal.name)} style={[styles.mealOption, selectedMeal === meal.name && styles.selectedMealOption]}>
                <Text style={styles.mealOptionEmoji}>{meal.emoji}</Text><Text style={[styles.mealOptionName, selectedMeal === meal.name && styles.selectedMealText]}>{meal.name}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.quickMealEstimate}><Text style={styles.estimateTitle}>QUICK ESTIMATE</Text><Text style={styles.estimateNumbers}>250 kcal <Text style={styles.estimateDivider}>·</Text> 15g protein <Text style={styles.estimateDivider}>·</Text> 4g sugar</Text></View>
          <Pressable onPress={onLog} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Log {selectedMeal.toLowerCase()}</Text><Text style={styles.buttonArrow}>→</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function NutritionRow({ label, current, target, progress, tint, last = false }: { label: string; current: string; target: string; progress: number; tint: string; last?: boolean }) {
  return (
    <View style={[styles.nutritionRow, last && styles.lastNutritionRow]}>
      <View style={styles.nutritionTop}><Text style={styles.nutrientLabel}>{label}</Text><Text style={styles.nutrientNumbers}><Text style={styles.nutrientCurrent}>{current}</Text> / {target}</Text></View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: tint }]} /></View>
    </View>
  );
}

function SettingsPage({ settings, isDarkTheme, onChange, profile, onProfileChange, onClearAllData, onRestoreDemoData, onSignOut }: {
  settings: UserSettings;
  isDarkTheme: boolean;
  onChange: (settings: UserSettings) => void;
  profile: SavedProfile | null;
  onProfileChange: (profile: SavedProfile) => void;
  onClearAllData: () => void;
  onRestoreDemoData: () => void;
  onSignOut: () => void;
}) {
  const [excludedDraft, setExcludedDraft] = useState('');
  const [likedFoodDraft, setLikedFoodDraft] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const calorieGoal = calculateCalorieGoal(settings);
  const bmrSexAdjustment = settings.sex === 'Male' ? 5 : settings.sex === 'Female' ? -161 : -78;
  const bmr = Math.round(10 * settings.currentWeightKg + 6.25 * settings.heightCm - 5 * settings.age + bmrSexAdjustment);

  function changeField<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    const nextSettings = { ...settings, [key]: value };
    onChange({ ...nextSettings, ...normalizeMacroSplit(nextSettings) });
  }

  function changeProfile<K extends keyof SavedProfile>(key: K, value: SavedProfile[K]) {
    if (profile) onProfileChange({ ...profile, [key]: value });
  }

  function addFavoriteFood() {
    const food = likedFoodDraft.trim();
    if (!food || !profile || profile.likedFoods.some((item) => item.toLowerCase() === food.toLowerCase())) return;
    changeProfile('likedFoods', [...profile.likedFoods, food]);
    setLikedFoodDraft('');
  }

  function setNumber(key: 'age' | 'heightCm' | 'currentWeightKg' | 'targetWeightKg', raw: string): boolean {
    const value = Number(raw);
    const minimum = key === 'age' ? 13 : key === 'heightCm' ? 80 : 25;
    const maximum = key === 'age' ? 120 : key === 'heightCm' ? 250 : 350;
    if (!Number.isFinite(value) || value < minimum || value > maximum) return false;
    changeField(key, value);
    return true;
  }

  function addExcludedFood() {
    const food = excludedDraft.trim();
    if (!food || settings.excludedFoods.some((item) => item.toLowerCase() === food.toLowerCase())) return;
    changeField('excludedFoods', [...settings.excludedFoods, food]);
    setExcludedDraft('');
  }

  function adjustMacro(key: 'proteinPercent' | 'carbPercent' | 'fatPercent', delta: number) {
    const limits = getNutritionGuidance(settings).macros;
    const getRange = (macroKey: 'proteinPercent' | 'carbPercent' | 'fatPercent') => macroKey === 'proteinPercent' ? limits.protein : macroKey === 'carbPercent' ? limits.carbs : limits.fat;
    const targetRange = getRange(key);
    const nextValue = Math.min(targetRange.max, Math.max(targetRange.min, settings[key] + delta));
    if (nextValue === settings[key]) return;
    const next = { ...settings, [key]: nextValue };
    let remaining = settings[key] - nextValue;
    const partners = (['carbPercent', 'proteinPercent', 'fatPercent'] as const).filter((candidate) => candidate !== key);
    for (const partner of partners) {
      const range = getRange(partner);
      const capacity = remaining > 0 ? range.max - next[partner] : next[partner] - range.min;
      const transfer = Math.sign(remaining) * Math.min(Math.abs(remaining), capacity);
      next[partner] += transfer;
      remaining -= transfer;
    }
    if (remaining === 0) onChange(next);
  }

  function addRoutine() {
    const routine: Routine = { id: `routine-${Date.now()}`, name: 'New routine', time: '7:00 PM', prompt: 'Add a meal or activity prompt.', enabled: true };
    changeField('routines', [...settings.routines, routine]);
  }

  function updateRoutine(id: string, key: keyof Omit<Routine, 'id'>, value: string | boolean) {
    changeField('routines', settings.routines.map((routine) => routine.id === id ? { ...routine, [key]: value } : routine));
  }

  const guidance = getNutritionGuidance(settings);
  const heightValue = settings.units === 'Metric' ? String(Math.round(settings.heightCm)) : String(Math.round(settings.heightCm / 2.54));
  const weightValue = settings.units === 'Metric' ? String(settings.currentWeightKg) : String(Math.round(settings.currentWeightKg * 2.20462 * 10) / 10);
  const targetWeightValue = settings.units === 'Metric' ? String(settings.targetWeightKg) : String(Math.round(settings.targetWeightKg * 2.20462 * 10) / 10);

  return (
      <View style={[styles.settingsScreen, isDarkTheme && styles.settingsScreenDark]}>
      <View style={[styles.settingsIntro, isDarkTheme && styles.settingsIntroDark]}>
        <Text style={styles.eyebrow}>YOUR CONTROL PANEL</Text>
        <Text style={styles.placeholderTitle}>Settings</Text>
        <Text style={styles.placeholderBody}>Your numbers and preferences shape daily targets, recipe filters, and reminders. Calorie figures are estimates, not medical advice.</Text>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.settingsSectionTitle}>Biometrics & profile</Text>
        {profile ? <Text style={styles.settingsHint}>Profile: {profile.name} · {profile.email}</Text> : <Text style={styles.settingsHint}>Local profile · not synced to an account</Text>}
        <Text style={styles.settingLabel}>Name</Text>
        <TextInput editable={Boolean(profile)} onChangeText={(value) => changeProfile('name', value)} style={styles.settingsInput} value={profile?.name ?? ''} placeholder="Create a local profile first" placeholderTextColor={colors.muted} />
        <View style={styles.settingsGrid}>
          <SettingsText label="City" value={profile?.city ?? ''} editable={Boolean(profile)} onChange={(value) => changeProfile('city', value)} />
          <SettingsText label="Country / region" value={profile?.country ?? ''} editable={Boolean(profile)} onChange={(value) => changeProfile('country', value)} />
        </View>
        <Text style={styles.settingLabel}>Gender</Text>
        <ChoiceButtons disabled={!profile} options={['Woman', 'Man', 'Non-binary', 'Prefer not to say']} value={profile?.gender || 'Prefer not to say'} onSelect={(value) => changeProfile('gender', value)} />
        <View style={styles.settingsGrid}>
          <SettingsNumber label="Age" suffix="years" value={String(settings.age)} onChange={(value) => setNumber('age', value)} />
          <SettingsNumber label="Height" suffix={settings.units === 'Metric' ? 'cm' : 'in'} value={heightValue} onChange={(value) => setNumber('heightCm', settings.units === 'Metric' ? value : String(Number(value) * 2.54))} />
          <SettingsNumber label="Current weight" suffix={settings.units === 'Metric' ? 'kg' : 'lb'} value={weightValue} onChange={(value) => setNumber('currentWeightKg', settings.units === 'Metric' ? value : String(Number(value) / 2.20462))} />
          <SettingsNumber label="Target weight" suffix={settings.units === 'Metric' ? 'kg' : 'lb'} value={targetWeightValue} onChange={(value) => setNumber('targetWeightKg', settings.units === 'Metric' ? value : String(Number(value) / 2.20462))} />
        </View>
        <Text style={styles.settingLabel}>Sex used for BMR estimate</Text>
        <ChoiceButtons options={['Female', 'Male', 'Prefer not to say']} value={settings.sex} onSelect={(value) => changeField('sex', value as UserSettings['sex'])} />
        <Text style={styles.settingLabel}>Baseline activity</Text>
        <ChoiceButtons options={['Sedentary', 'Lightly active', 'Highly active']} value={settings.activityLevel} onSelect={(value) => changeField('activityLevel', value as ActivityLevel)} />
        <Text style={styles.settingLabel}>Goal pace</Text>
        <ChoiceButtons disabled={settings.age < 18} options={['Lose 0.25 kg/week', 'Lose 0.5 kg/week', 'Maintain', 'Build muscle']} value={settings.goalPace} onSelect={(value) => changeField('goalPace', value as GoalPace)} />
        {settings.age < 18 ? <Text style={styles.settingsHint}>Weight-change goals are disabled for users under 18; consult a qualified clinician about growth and nutrition needs.</Text> : null}
        <View style={styles.calorieEstimatePanel}>
          <View><Text style={styles.estimateTitle}>ESTIMATED DAILY TARGET</Text><Text style={styles.settingsCalorieValue}>{calorieGoal.toLocaleString()} kcal</Text></View>
          <View style={styles.estimateSide}><Text style={styles.estimateTitle}>{settings.age < 18 ? 'BMR' : 'BMR'}</Text><Text style={styles.bmrValue}>{settings.age < 18 ? 'Not estimated' : `${bmr.toLocaleString()} kcal`}</Text></View>
        </View>
        <Text style={styles.settingsHint}>{guidance.ageBandLabel} reference: {guidance.calorieMin.toLocaleString()}–{guidance.calorieMax.toLocaleString()} kcal/day. {settings.activityLevel} selects a point within this user-provided range.</Text>
        {guidance.bodyFatRange ? <Text style={styles.settingsHint}>Population body-fat reference for {settings.sex.toLowerCase()}: {guidance.bodyFatRange}. Informational only; not measured or used as a goal.</Text> : <Text style={styles.settingsHint}>No body-fat reference selected for “Prefer not to say.”</Text>}
        <Text style={styles.settingsHint}>{guidance.note}</Text>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.settingsSectionTitle}>Diet & exclusions</Text>
        <Text style={styles.settingsHint}>These local filters affect the sample recipe list. They are not sent to an API.</Text>
        <DietToggle label="Vegan" value={settings.diets.vegan} onChange={(value) => changeField('diets', { ...settings.diets, vegan: value, vegetarian: value || settings.diets.vegetarian })} />
        <DietToggle label="Vegetarian" value={settings.diets.vegetarian} onChange={(value) => changeField('diets', { ...settings.diets, vegetarian: value })} />
        <DietToggle label="Keto" value={settings.diets.keto} onChange={(value) => changeField('diets', { ...settings.diets, keto: value })} />
        <DietToggle label="Dairy-free" value={settings.diets.dairyFree} onChange={(value) => changeField('diets', { ...settings.diets, dairyFree: value })} />
        <Text style={styles.settingLabel}>Foods to exclude</Text>
        <View style={styles.settingsAddRow}><TextInput onChangeText={setExcludedDraft} onSubmitEditing={addExcludedFood} placeholder="e.g. peanuts, shellfish" placeholderTextColor={colors.muted} style={[styles.input, styles.settingsTextInput]} value={excludedDraft} /><Pressable onPress={addExcludedFood} style={styles.addIngredientButton}><Text style={styles.addIngredientButtonText}>Add</Text></Pressable></View>
        <View style={styles.likedFoodTags}>{settings.excludedFoods.map((food) => <Pressable key={food} onPress={() => changeField('excludedFoods', settings.excludedFoods.filter((item) => item !== food))} style={styles.excludedFoodTag}><Text style={styles.excludedFoodTagText}>{food}  ×</Text></Pressable>)}</View>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.settingsSectionTitle}>Macro split</Text>
        <Text style={styles.settingsHint}>Reference ranges for {guidance.ageBandLabel}. Adjust in 5% steps; totals remain at 100% and stay within these ranges.</Text>
        <MacroControl label="Carbs" value={settings.carbPercent} minimum={guidance.macros.carbs.min} maximum={guidance.macros.carbs.max} grams={Math.round(calorieGoal * settings.carbPercent / 100 / 4)} onDecrease={() => adjustMacro('carbPercent', -5)} onIncrease={() => adjustMacro('carbPercent', 5)} />
        <MacroControl label="Protein" value={settings.proteinPercent} minimum={guidance.macros.protein.min} maximum={guidance.macros.protein.max} grams={Math.round(calorieGoal * settings.proteinPercent / 100 / 4)} onDecrease={() => adjustMacro('proteinPercent', -5)} onIncrease={() => adjustMacro('proteinPercent', 5)} />
        <MacroControl label="Fat" value={settings.fatPercent} minimum={guidance.macros.fat.min} maximum={guidance.macros.fat.max} grams={Math.round(calorieGoal * settings.fatPercent / 100 / 9)} onDecrease={() => adjustMacro('fatPercent', -5)} onIncrease={() => adjustMacro('fatPercent', 5)} />
        <Text style={styles.macroTotal}>Total: {settings.proteinPercent + settings.carbPercent + settings.fatPercent}%</Text>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.settingsSectionTitle}>Micronutrient focus</Text>
        <Text style={styles.settingsHint}>Suggested nutrients for {guidance.ageBandLabel.toLowerCase()} based on your supplied reference. No nutrient amounts are estimated yet.</Text>
        <View style={styles.microTagList}>{guidance.micronutrients.map((nutrient) => <View key={nutrient} style={styles.microTag}><Text style={styles.microTagText}>{nutrient}</Text></View>)}</View>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.settingsSectionTitle}>Taste & discovery</Text>
        <Text style={styles.settingsHint}>Saved taste settings personalize related-food ideas.</Text>
        {!profile ? <Text style={styles.settingsHint}>Create a local profile from the sign-in screen to edit personal taste preferences.</Text> : null}
        <Text style={styles.settingLabel}>Sweetness</Text>
        <ChoiceButtons disabled={!profile} options={['Mild', 'Balanced', 'Bold']} value={profile?.sweetness ?? 'Balanced'} onSelect={(value) => changeProfile('sweetness', value as TasteLevel)} />
        <Text style={styles.settingLabel}>Spice</Text>
        <ChoiceButtons disabled={!profile} options={['Mild', 'Balanced', 'Bold']} value={profile?.spice ?? 'Balanced'} onSelect={(value) => changeProfile('spice', value as TasteLevel)} />
        <DietToggle disabled={!profile} label="Try new foods related to favourites" value={profile?.adventurous ?? false} onChange={(value) => changeProfile('adventurous', value)} />
        <Text style={styles.settingLabel}>Favourite foods</Text>
        <View style={styles.settingsAddRow}><TextInput editable={Boolean(profile)} onChangeText={setLikedFoodDraft} onSubmitEditing={addFavoriteFood} placeholder="e.g. mango, paneer, ramen" placeholderTextColor={colors.muted} style={[styles.input, styles.settingsTextInput]} value={likedFoodDraft} /><Pressable disabled={!profile} onPress={addFavoriteFood} style={styles.addIngredientButton}><Text style={styles.addIngredientButtonText}>Add</Text></Pressable></View>
        <View style={styles.likedFoodTags}>{(profile?.likedFoods ?? []).map((food) => <Pressable key={food} onPress={() => changeProfile('likedFoods', profile!.likedFoods.filter((item) => item !== food))} style={styles.likedFoodTag}><Text style={styles.likedFoodTagText}>{food}  ×</Text></Pressable>)}</View>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.settingsSectionTitle}>Routines & reminders</Text>
        <Text style={styles.settingsHint}>Recurring local schedule blocks. This prototype does not send background push notifications.</Text>
        {settings.routines.map((routine) => (
          <View key={routine.id} style={styles.routineEditor}>
            <View style={styles.routineEditorTop}>
              <Text style={styles.routineEditorCaption}>DAILY ROUTINE</Text>
              <View style={styles.routineEditorActions}>
                <Pressable onPress={() => updateRoutine(routine.id, 'enabled', !routine.enabled)} style={[styles.routineStateChip, routine.enabled && styles.routineStateChipOn]}><Text style={[styles.routineStateText, routine.enabled && styles.routineStateTextOn]}>{routine.enabled ? 'On' : 'Off'}</Text></Pressable>
                <Pressable onPress={() => changeField('routines', settings.routines.filter((item) => item.id !== routine.id))} accessibilityLabel={`Remove ${routine.name}`} style={styles.removeRoutineButton}><Text style={styles.removeRoutineText}>×</Text></Pressable>
              </View>
            </View>
            <TextInput onChangeText={(value) => updateRoutine(routine.id, 'name', value)} style={styles.settingsInput} value={routine.name} />
            <View style={styles.routineFieldRow}><View style={styles.routineTimeField}><Text style={styles.settingLabel}>Time</Text><TextInput onChangeText={(value) => updateRoutine(routine.id, 'time', value)} placeholder="6:30 PM" style={styles.settingsInput} value={routine.time} /></View><View style={styles.routinePromptField}><Text style={styles.settingLabel}>Meal prompt</Text><TextInput onChangeText={(value) => updateRoutine(routine.id, 'prompt', value)} style={styles.settingsInput} value={routine.prompt} /></View></View>
          </View>
        ))}
        <Pressable onPress={addRoutine} style={styles.outlineAction}><Text style={styles.outlineActionText}>+ Add daily routine</Text></Pressable>
        <Text style={styles.settingLabel}>Fridge expiry warning</Text>
        <Text style={styles.settingsHint}>Show warnings this many days before expiry.</Text>
        <ChoiceButtons options={['0 days', '1 day', '2 days', '3 days', '7 days']} value={`${settings.expirationAlertDays} ${settings.expirationAlertDays === 1 ? 'day' : 'days'}`} onSelect={(value) => changeField('expirationAlertDays', Number(value.split(' ')[0]))} />
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.settingsSectionTitle}>App preferences</Text>
        <Text style={styles.settingLabel}>Daily water goal</Text>
        <View style={styles.stepperLine}><Pressable onPress={() => changeField('waterGoalMl', Math.max(500, settings.waterGoalMl - 250))} style={styles.stepperButton}><Text style={styles.stepperText}>−</Text></Pressable><Text style={styles.stepperValue}>{formatWater(settings.waterGoalMl, settings.units)}</Text><Pressable onPress={() => changeField('waterGoalMl', settings.waterGoalMl + 250)} style={styles.stepperButton}><Text style={styles.stepperText}>+</Text></Pressable></View>
        <Text style={styles.settingLabel}>Measurement units</Text>
        <ChoiceButtons options={['Metric', 'Imperial']} value={settings.units} onSelect={(value) => changeField('units', value as UnitPreference)} />
        <Text style={styles.settingLabel}>Appearance</Text>
        <ChoiceButtons options={['System', 'Light', 'Dark']} value={settings.theme} onSelect={(value) => changeField('theme', value as ThemePreference)} />
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.settingsSectionTitle}>Local test data</Text>
        <Text style={styles.settingsHint}>Your settings and taste profile are stored on this device only. No backend account or push service is connected.</Text>
        <Pressable onPress={onRestoreDemoData} style={styles.restoreButton}><Text style={styles.restoreButtonText}>Restore demo data</Text></Pressable>
        <Pressable onPress={onSignOut} style={styles.signOutButton}><Text style={styles.signOutButtonText}>Sign out</Text></Pressable>
        {confirmClear ? <View style={styles.confirmClearPanel}><Text style={styles.confirmClearText}>Clear the fridge, tracker, settings, routines, and saved profile?</Text><View style={styles.confirmActions}><Pressable onPress={() => setConfirmClear(false)} style={styles.cancelClearButton}><Text style={styles.cancelClearText}>Cancel</Text></Pressable><Pressable onPress={() => { onClearAllData(); setConfirmClear(false); }} style={styles.clearConfirmButton}><Text style={styles.clearConfirmText}>Clear all data</Text></Pressable></View></View> : <Pressable onPress={() => setConfirmClear(true)} style={styles.clearDataButton}><Text style={styles.clearDataButtonText}>Clear all test data</Text></Pressable>}
      </View>
    </View>
  );
}

function SettingsNumber({ label, suffix, value, onChange }: { label: string; suffix: string; value: string; onChange: (value: string) => boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <View style={styles.settingsNumberField}><Text style={styles.settingLabel}>{label} · {suffix}</Text><TextInput keyboardType="decimal-pad" onChangeText={setDraft} onBlur={() => { if (!onChange(draft)) setDraft(value); }} style={styles.settingsInput} value={draft} /></View>;
}

function SettingsText({ label, value, editable, onChange }: { label: string; value: string; editable: boolean; onChange: (value: string) => void }) {
  return <View style={styles.settingsNumberField}><Text style={styles.settingLabel}>{label}</Text><TextInput editable={editable} onChangeText={onChange} style={styles.settingsInput} value={value} /></View>;
}

function ChoiceButtons({ options, value, onSelect, disabled = false }: { options: string[]; value: string; onSelect: (value: string) => void; disabled?: boolean }) {
  return <View style={styles.settingsChoices}>{options.map((option) => <Pressable key={option} disabled={disabled} onPress={() => onSelect(option)} style={[styles.settingsChoice, value === option && styles.settingsChoiceSelected, disabled && styles.disabledControl]}><Text style={[styles.settingsChoiceText, value === option && styles.settingsChoiceTextSelected]}>{option}</Text></Pressable>)}</View>;
}

function DietToggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={() => onChange(!value)} style={[styles.dietToggle, disabled && styles.disabledControl]}><Text style={styles.dietToggleLabel}>{label}</Text><View style={[styles.toggleTrack, value && styles.toggleTrackOn]}><View style={[styles.toggleThumb, value && styles.toggleThumbOn]} /></View></Pressable>;
}

function MacroControl({ label, value, minimum, maximum, grams, onDecrease, onIncrease }: { label: string; value: number; minimum: number; maximum: number; grams: number; onDecrease: () => void; onIncrease: () => void }) {
  return <View style={styles.macroControl}><View style={styles.macroLabelGroup}><Text style={styles.macroName}>{label} · {minimum}–{maximum}%</Text><Text style={styles.macroGrams}>about {grams} g</Text></View><Pressable disabled={value <= minimum} onPress={onDecrease} style={[styles.macroButton, value <= minimum && styles.disabledControl]}><Text style={styles.stepperText}>−</Text></Pressable><Text style={styles.macroPercent}>{value}%</Text><Pressable disabled={value >= maximum} onPress={onIncrease} style={[styles.macroButton, value >= maximum && styles.disabledControl]}><Text style={styles.stepperText}>+</Text></Pressable></View>;
}

function TabPage({ tab, inventory, calories, protein, sugar, micronutrientsDone, onToggleMicronutrient, ingredientDraft, onIngredientDraftChange, onAddIngredient, onAdjustIngredient, onRemoveIngredient, onClearAllData, onRestoreDemoData, profile, settings, onSettingsChange, onProfileChange, onSignOut, onOpenSettings, onLogAndCook, isDarkTheme }: {
  tab: Exclude<Tab, 'Today'>;
  inventory: InventoryItem[];
  calories: number;
  protein: number;
  sugar: number;
  micronutrientsDone: string[];
  onToggleMicronutrient: (nutrient: string) => void;
  ingredientDraft: string;
  onIngredientDraftChange: (value: string) => void;
  onAddIngredient: () => void;
  onAdjustIngredient: (name: string, delta: number) => void;
  onRemoveIngredient: (name: string) => void;
  onClearAllData: () => void;
  onRestoreDemoData: () => void;
  profile: SavedProfile | null;
  settings: UserSettings;
  onSettingsChange: (settings: UserSettings) => void;
  onProfileChange: (profile: SavedProfile) => void;
  onSignOut: () => void;
  onOpenSettings: () => void;
  onLogAndCook: (recipe: Recipe) => void;
  isDarkTheme: boolean;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const pages: Record<Exclude<Tab, 'Today'>, { kicker: string; title: string; body: string; action: string }> = {
    Fridge: { kicker: 'YOUR KITCHEN', title: 'Fridge inventory', body: 'Your food list will live here. Add items with a photo or enter them by hand.', action: '+ Add food' },
    Recipes: { kicker: 'COOK WITH WHAT YOU HAVE', title: 'Recipes for you', body: 'Recipe ideas will match your fridge and the goals you choose.', action: 'Find a recipe' },
    Tracker: { kicker: 'YOUR DAILY TRACKER', title: 'Nutrition, your way', body: 'Choose the nutrients you want to follow and set targets that work for you.', action: 'Choose your goals' },
    Settings: { kicker: 'YOUR CONTROL PANEL', title: 'Settings', body: 'Adjust your profile and nutrition preferences.', action: 'Settings' },
  };
  const page = pages[tab];
  if (tab === 'Fridge') {
    const inventoryCount = inventory.reduce((total, item) => total + item.quantity, 0);
    return (
      <View style={styles.placeholderSection}>
        <Text style={styles.eyebrow}>{page.kicker}</Text>
        <Text style={styles.placeholderTitle}>{page.title}</Text>
        <Text style={styles.placeholderBody}>Add ingredients manually to test inventory and recipe matching. This list is stored in memory for this session.</Text>
        <View style={styles.addIngredientRow}>
          <TextInput
            onChangeText={onIngredientDraftChange}
            onSubmitEditing={onAddIngredient}
            placeholder="e.g. spinach, eggs"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            style={[styles.input, styles.ingredientInput]}
            value={ingredientDraft}
          />
          <Pressable onPress={onAddIngredient} style={styles.addIngredientButton}><Text style={styles.addIngredientButtonText}>Add</Text></Pressable>
        </View>
        <Text style={styles.inventorySummary}>{inventoryCount} items across {inventory.length} ingredients</Text>
        {inventory.length ? inventory.map((item) => (
          <View key={item.name} style={styles.inventoryRow}>
            <Text style={styles.inventoryItemName}>{item.name}</Text>
            <View style={styles.inventoryActions}>
              <Pressable onPress={() => onAdjustIngredient(item.name, -1)} style={styles.inventoryStep}><Text style={styles.inventoryStepText}>−</Text></Pressable>
              <Text style={styles.inventoryQuantity}>{item.quantity}</Text>
              <Pressable onPress={() => onAdjustIngredient(item.name, 1)} style={styles.inventoryStep}><Text style={styles.inventoryStepText}>+</Text></Pressable>
              {item.expiresInHours !== undefined ? <Text style={styles.inventoryExpiry}>{item.expiresInHours}h</Text> : null}
              <Pressable onPress={() => onRemoveIngredient(item.name)} accessibilityLabel={`Remove ${item.name}`} style={styles.inventoryRemove}><Text style={styles.inventoryRemoveText}>×</Text></Pressable>
            </View>
          </View>
        )) : <Text style={styles.emptyInventory}>Your test fridge is empty. Add an ingredient above.</Text>}
      </View>
    );
  }
  if (tab === 'Settings') {
    return <SettingsPage settings={settings} isDarkTheme={isDarkTheme} onChange={onSettingsChange} profile={profile} onProfileChange={onProfileChange} onClearAllData={onClearAllData} onRestoreDemoData={onRestoreDemoData} onSignOut={onSignOut} />;
  }
  if (tab === 'Recipes') {
    const availableRecipes = recipes.filter((recipe) => recipeMatchesPreferences(recipe, settings));
    return (
      <View style={styles.tabContent}>
        <Text style={styles.eyebrow}>{page.kicker}</Text><Text style={styles.placeholderTitle}>{page.title}</Text>
        <Text style={styles.placeholderBody}>Filtered using your diet and excluded-food settings.</Text>
        {!availableRecipes.length ? <View style={styles.emptyRecipes}><Text style={styles.emptyInventory}>No sample recipes fit these filters. Review your exclusions and diet settings.</Text><Pressable onPress={onOpenSettings}><Text style={styles.actionText}>Open settings →</Text></Pressable></View> : availableRecipes.map((recipe) => {
          const missing = recipe.ingredients.filter((item) => !inventory.some((stock) => stock.name === item && stock.quantity > 0));
          return <View key={recipe.name} style={styles.recipeListRow}><Text style={styles.recipeEmoji}>{recipe.emoji}</Text><View style={styles.recipeListInfo}><Text style={styles.recipeName}>{recipe.name}</Text><Text style={styles.recipeDetail}>{missing.length ? `Needs ${missing.join(', ')}` : `${recipe.calories} kcal · ${recipe.protein}g protein`}</Text></View><Pressable disabled={missing.length > 0} onPress={() => onLogAndCook(recipe)} style={[styles.recipeListAction, missing.length > 0 && styles.cookButtonDisabled]}><Text style={styles.recipeListActionText}>{missing.length ? 'Missing' : 'Cook'}</Text></Pressable></View>;
        })}
      </View>
    );
  }
  if (tab === 'Tracker') {
    const goal = calculateCalorieGoal(settings);
    const guidance = getNutritionGuidance(settings);
    return (
      <View style={styles.tabContent}>
        <Text style={styles.eyebrow}>{page.kicker}</Text><Text style={styles.placeholderTitle}>{page.title}</Text>
        <Text style={styles.placeholderBody}>Daily guidance from the age and sex ranges you supplied. Values are population references, not a clinical assessment.</Text>
        <View style={styles.trackerSummary}><Text style={styles.settingsSectionTitle}>Daily energy reference</Text><Text style={styles.settingsCalorieValue}>{goal.toLocaleString()} kcal</Text><Text style={styles.settingsHint}>{guidance.ageBandLabel} · {guidance.calorieMin.toLocaleString()}–{guidance.calorieMax.toLocaleString()} kcal/day · {settings.activityLevel}</Text><Text style={styles.settingsHint}>{guidance.note}</Text></View>
        <View style={styles.trackerSummary}>
          <Text style={styles.settingsSectionTitle}>Today so far</Text>
          <NutritionRow label="Energy" current={calories.toLocaleString()} target={`${goal.toLocaleString()} kcal`} progress={Math.min(calories / goal * 100, 100)} tint={colors.yellow} />
          <NutritionRow label="Protein" current={`${protein}`} target={`${Math.round(goal * settings.proteinPercent / 100 / 4)} g · ${settings.proteinPercent}%`} progress={Math.min(protein / (goal * settings.proteinPercent / 100 / 4) * 100, 100)} tint={colors.green} />
          <NutritionRow label="Added sugar" current={`${sugar}`} target="30 g max" progress={Math.min(sugar / 30 * 100, 100)} tint={colors.coral} last />
        </View>
        <View style={styles.trackerSummary}><Text style={styles.settingsSectionTitle}>Macro targets</Text><Text style={styles.settingsHint}>Allowed reference split: carbs {guidance.macros.carbs.min}–{guidance.macros.carbs.max}%, protein {guidance.macros.protein.min}–{guidance.macros.protein.max}%, fat {guidance.macros.fat.min}–{guidance.macros.fat.max}%.</Text><NutritionRow label="Carbohydrates" current="—" target={`${Math.round(goal * settings.carbPercent / 100 / 4)} g · ${settings.carbPercent}%`} progress={settings.carbPercent} tint={colors.yellow} /><NutritionRow label="Fat" current="—" target={`${Math.round(goal * settings.fatPercent / 100 / 9)} g · ${settings.fatPercent}%`} progress={settings.fatPercent} tint={colors.coral} last /></View>
        <View style={styles.trackerSummary}>
          <Text style={styles.settingsSectionTitle}>Micronutrients to track</Text>
          <Text style={styles.settingsHint}>{guidance.ageBandLabel} reference · check items as you log them. Amounts are not calculated yet.</Text>
          {guidance.micronutrients.map((nutrient) => (
            <Pressable key={nutrient} onPress={() => onToggleMicronutrient(nutrient)} style={styles.microCheckRow}>
              <View style={[styles.microCheck, micronutrientsDone.includes(nutrient) && styles.microCheckSelected]}><Text style={styles.microCheckMark}>{micronutrientsDone.includes(nutrient) ? '✓' : ''}</Text></View>
              <Text style={styles.microCheckLabel}>{nutrient}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={onOpenSettings} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Adjust goals & macros</Text><Text style={styles.buttonArrow}>→</Text></Pressable>
      </View>
    );
  }
  return (
    <View style={styles.placeholderSection}>
      <Text style={styles.eyebrow}>{page.kicker}</Text>
      <Text style={styles.placeholderTitle}>{page.title}</Text>
      <Text style={styles.placeholderBody}>{page.body}</Text>
      <Pressable style={styles.primaryButton}><Text style={styles.primaryButtonText}>{page.action}</Text><Text style={styles.buttonArrow}>→</Text></Pressable>
      <Text style={styles.comingSoon}>Your choices will shape this space.</Text>
    </View>
  );
}

const colors = { green: '#265E48', deepGreen: '#174532', coral: '#D8745C', yellow: '#D7A93D', ink: '#202B26', muted: '#8A938C', paper: '#F8F8F2' };

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  loginScreen: { flex: 1, backgroundColor: colors.paper },
  loginHero: { backgroundColor: colors.deepGreen, paddingHorizontal: 28, paddingTop: 22, paddingBottom: 20 },
  brandMark: { height: 32, width: 32, borderRadius: 9, backgroundColor: '#D5E6A8', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  brandMarkText: { color: colors.deepGreen, fontSize: 23, lineHeight: 27, fontWeight: '800', fontFamily: 'Georgia' },
  brandName: { color: '#E6EAD9', fontSize: 13, fontWeight: '700' },
  accountNoteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  heroTitle: { color: '#F8F6EC', fontFamily: 'Georgia', fontSize: 32, lineHeight: 37, marginTop: 22 },
  heroCopy: { color: '#C6D3C6', fontSize: 13, marginTop: 8 },
  heroStats: { flexDirection: 'row', gap: 19, marginTop: 15 },
  heroStat: { color: '#DCE6D5', fontSize: 11 },
  loginForm: { paddingHorizontal: 28, paddingTop: 21, paddingBottom: 16 },
  eyebrow: { color: colors.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  formTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 26, marginTop: 6 },
  formSubtitle: { color: '#747E76', fontSize: 12, marginTop: 4, marginBottom: 15 },
  fieldLabel: { color: colors.ink, fontSize: 11, fontWeight: '700', marginBottom: 6, marginTop: 7 },
  input: { height: 44, borderWidth: 1, borderColor: '#DDE2D9', borderRadius: 7, paddingHorizontal: 12, fontSize: 13, color: colors.ink, backgroundColor: '#FFFFFF' },
  errorText: { color: '#B54F42', fontSize: 11, marginTop: 7 },
  primaryButton: { backgroundColor: colors.green, minHeight: 47, borderRadius: 7, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  buttonArrow: { color: '#FFFFFF', fontSize: 19 },
  demoLink: { color: colors.green, textAlign: 'center', fontSize: 12, fontWeight: '700', marginTop: 12 },
  accountNote: { color: '#727C74', textAlign: 'center', fontSize: 11, marginTop: 15 },
  accountLink: { color: colors.green, fontWeight: '700' },
  localNote: { color: '#9BA39C', textAlign: 'center', fontSize: 9, marginTop: 8 },
  onboardingScreen: { flex: 1, backgroundColor: colors.paper },
  onboardingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 13, paddingBottom: 11 },
  onboardingBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandNameDark: { color: colors.deepGreen, fontSize: 13, fontWeight: '700' },
  stepCount: { color: '#818A81', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  stepTrack: { height: 3, backgroundColor: '#E7EBE3' },
  stepTrackFill: { width: '50%', height: 3, backgroundColor: colors.green },
  stepTrackComplete: { width: '100%' },
  onboardingContent: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 23, paddingTop: 24, paddingBottom: 32 },
  onboardingTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 29, marginTop: 7 },
  onboardingSubtitle: { color: '#747E76', fontSize: 12, lineHeight: 18, marginTop: 7, marginBottom: 13 },
  prototypeNote: { color: '#6E785E', backgroundColor: '#EEF2E6', borderRadius: 5, fontSize: 10, lineHeight: 15, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 9 },
  fieldColumns: { flexDirection: 'row', gap: 10, marginTop: 1 },
  fieldColumn: { flex: 1, minWidth: 0 },
  optionalLabel: { color: '#8D968E', fontSize: 9, fontWeight: '400' },
  genderSummary: { color: '#727C74', fontSize: 10, marginTop: 1, marginBottom: 7 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 1, marginBottom: 4 },
  choiceChip: { borderWidth: 1, borderColor: '#DDE3D9', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#FFFFFF' },
  choiceChipSelected: { borderColor: colors.green, backgroundColor: '#EAF1E7' },
  choiceChipText: { color: '#68736A', fontSize: 9, fontWeight: '600' },
  choiceChipTextSelected: { color: colors.green, fontWeight: '800' },
  privacyNote: { color: '#879087', fontSize: 9, lineHeight: 14, marginTop: 12 },
  backToLogin: { color: colors.green, textAlign: 'center', fontSize: 11, fontWeight: '700', marginTop: 15 },
  preferenceLabel: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 20, marginBottom: 9 },
  preferenceChoices: { flexDirection: 'row', gap: 8 },
  preferenceChoice: { flex: 1, minHeight: 72, borderWidth: 1, borderColor: '#E0E5DC', borderRadius: 7, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 5 },
  preferenceChoiceSelected: { borderColor: colors.green, backgroundColor: '#ECF2E8' },
  preferenceEmoji: { fontSize: 19 },
  preferenceChoiceText: { color: '#6F796F', fontSize: 10, fontWeight: '600' },
  preferenceChoiceTextSelected: { color: colors.green, fontWeight: '800' },
  adventureToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E6EAE2', paddingVertical: 3, marginTop: 18 },
  adventureCopy: { flex: 1 },
  adventureHint: { color: '#778178', fontSize: 10, lineHeight: 15, marginTop: 3 },
  toggleTrack: { width: 39, height: 23, borderRadius: 12, backgroundColor: '#D6DDD4', padding: 3, justifyContent: 'center' },
  toggleTrackOn: { backgroundColor: colors.green },
  toggleThumb: { width: 17, height: 17, borderRadius: 9, backgroundColor: '#FFFFFF' },
  toggleThumbOn: { alignSelf: 'flex-end' },
  addFoodRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  likedFoodInput: { flex: 1 },
  likedFoodTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  likedFoodTag: { backgroundColor: '#E9F0E5', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  likedFoodTagText: { color: colors.green, fontSize: 10, fontWeight: '700' },
  foodEmptyHint: { color: '#929A92', fontSize: 10, marginTop: 9 },
  homeScreen: { flex: 1, backgroundColor: colors.paper },
  homeContent: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 21, paddingTop: 14, paddingBottom: 24 },
  homeHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: 12, marginBottom: 17 },
  dateLabel: { color: '#828B81', fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  greeting: { color: colors.ink, fontFamily: 'Georgia', fontSize: 23, marginTop: 5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap' },
  headerLogButton: { minHeight: 36, borderRadius: 6, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11 },
  headerLogPlus: { color: '#FFFFFF', fontSize: 18, lineHeight: 20 },
  headerLogText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  streakBadge: { borderRadius: 16, backgroundColor: '#FFF0D9', paddingHorizontal: 9, paddingVertical: 7 },
  streakText: { color: '#8A5C21', fontSize: 9, fontWeight: '700' },
  avatar: { height: 38, width: 38, borderRadius: 19, backgroundColor: '#DCE8D5', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.deepGreen, fontFamily: 'Georgia', fontSize: 17 },
  fridgeBanner: { backgroundColor: colors.green, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12 },
  bannerTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bannerEyebrow: { color: '#D5E2CE', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  bannerArrow: { color: '#F1D28B', fontSize: 17 },
  fridgeCount: { color: '#FFFFFF', fontFamily: 'Georgia', fontSize: 27, marginTop: 5 },
  fridgeCountUnit: { color: '#E2EBDD', fontFamily: 'System', fontSize: 12 },
  expirationBadge: { alignSelf: 'flex-start', backgroundColor: '#F6D89A', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5, marginTop: 8 },
  expirationText: { color: '#664219', fontSize: 10, fontWeight: '800' },
  ingredientPills: { flexDirection: 'row', gap: 6, paddingTop: 9, paddingBottom: 2 },
  ingredientPill: { borderWidth: 1, borderColor: '#88A493', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5 },
  ingredientPillText: { color: '#F4F6EF', fontSize: 9, fontWeight: '600' },
  bannerBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  bannerDetail: { color: '#E2EBDD', fontSize: 10 },
  smallPill: { borderWidth: 1, borderColor: '#9FB9A0', borderRadius: 18, paddingHorizontal: 9, paddingVertical: 4 },
  smallPillText: { color: '#FFFFFF', fontSize: 9, fontWeight: '600' },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 18, marginBottom: 9 },
  sectionTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 19, marginTop: 3 },
  actionText: { color: colors.green, fontSize: 10, fontWeight: '700', paddingBottom: 2 },
  nutritionPanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EAE2', borderRadius: 8, paddingHorizontal: 12 },
  calorieSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 13, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#EEF0EA' },
  calorieKicker: { color: '#788279', fontSize: 8, fontWeight: '800', letterSpacing: 0.9 },
  calorieValue: { color: colors.green, fontFamily: 'Georgia', fontSize: 25, marginTop: 2 },
  calorieUnit: { color: '#718076', fontFamily: 'System', fontSize: 11 },
  calorieConsumed: { alignItems: 'flex-end' },
  consumedNumber: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  consumedLabel: { color: '#899289', fontSize: 9, marginTop: 2 },
  nutritionRow: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#EEF0EA' },
  lastNutritionRow: { borderBottomWidth: 0 },
  nutritionTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  nutrientLabel: { color: '#39443C', fontSize: 11, fontWeight: '600' },
  nutrientNumbers: { color: '#8A938C', fontSize: 9 },
  nutrientCurrent: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  progressTrack: { height: 5, backgroundColor: '#EDF0E9', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 4 },
  mealSlots: { flexDirection: 'row', gap: 7, marginTop: 9 },
  mealSlot: { flex: 1, minWidth: 0, alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EAE2', borderRadius: 7, paddingVertical: 9, paddingHorizontal: 3 },
  mealPlus: { width: 23, height: 23, borderRadius: 12, borderWidth: 1, borderColor: '#D7DED4', alignItems: 'center', justifyContent: 'center' },
  mealLogged: { backgroundColor: '#E5EEE3', borderColor: '#B8CEBA' },
  mealPlusText: { color: colors.green, fontSize: 15, fontWeight: '700', lineHeight: 19 },
  mealSlotLabel: { color: colors.ink, fontSize: 9, fontWeight: '700', marginTop: 5 },
  mealSlotCount: { color: '#899289', fontSize: 8, marginTop: 2 },
  recipeCarousel: { gap: 11, paddingRight: 2, paddingBottom: 2 },
  noRecipeCard: { color: '#778178', fontSize: 11, lineHeight: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EAE2', borderRadius: 7, padding: 13, maxWidth: 280 },
  recipeCard: { width: 242, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EAE2', borderRadius: 8, overflow: 'hidden' },
  recipeArt: { height: 94, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  recipeEmoji: { fontSize: 37 },
  recipeCardArrow: { position: 'absolute', right: 11, top: 9, color: colors.deepGreen, fontSize: 16 },
  recipeInfo: { paddingHorizontal: 12, paddingVertical: 11 },
  recipeTag: { color: colors.coral, fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },
  recipeName: { color: colors.ink, fontFamily: 'Georgia', fontSize: 17, lineHeight: 21, marginTop: 5, minHeight: 42 },
  recipeDetail: { color: '#778178', fontSize: 9, marginTop: 5 },
  recipeFacts: { flexDirection: 'row', gap: 6, marginTop: 9 },
  recipeFact: { color: colors.green, fontSize: 9, fontWeight: '700', backgroundColor: '#EEF3E9', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 4 },
  cookButton: { minHeight: 34, backgroundColor: colors.green, borderRadius: 5, marginTop: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cookButtonDisabled: { backgroundColor: '#AAB4AA' },
  relatedFoodsPanel: { backgroundColor: '#EDF1E8', borderRadius: 7, padding: 13, marginTop: 12 },
  relatedFoodsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  relatedFoodsTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 17, marginTop: 4 },
  discoveryMark: { color: colors.coral, fontSize: 20 },
  relatedFoodsCopy: { color: '#707A71', fontSize: 10, lineHeight: 15, marginTop: 7 },
  relatedFoodTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  relatedFoodTag: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE5D9', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5 },
  relatedFoodText: { color: colors.green, fontSize: 9, fontWeight: '700' },
  cookButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  cookButtonPlus: { color: '#FFFFFF', fontSize: 17 },
  tipLine: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 11 },
  tipMark: { color: colors.coral, fontSize: 14 },
  tipText: { color: '#6F796F', fontSize: 10, flex: 1 },
  bottomWidgets: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 13 },
  widgetPanel: { flexGrow: 1, flexBasis: 250, minWidth: 240, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EAE2', borderRadius: 8, padding: 14 },
  widgetHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  widgetTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 18, marginTop: 4 },
  waterDrop: { color: '#6DA9B1', fontSize: 22 },
  waterNumbers: { flexDirection: 'row', alignItems: 'baseline', marginTop: 12, marginBottom: 7 },
  waterCurrent: { color: colors.ink, fontFamily: 'Georgia', fontSize: 23 },
  waterTarget: { color: '#899289', fontSize: 10, marginLeft: 5 },
  waterAddButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#B9D2D4', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6, marginTop: 10 },
  waterAddText: { color: '#477E86', fontSize: 10, fontWeight: '700' },
  waterActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  waterStepButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#D6DED9', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  waterStepDisabled: { opacity: 0.45 },
  waterStepText: { color: '#69766F', fontSize: 10, fontWeight: '700' },
  routinePanel: { flexGrow: 1, flexBasis: 250, minWidth: 240, backgroundColor: '#F4E8D6', borderRadius: 8, padding: 14 },
  routineTitle: { color: '#483B2E', fontFamily: 'Georgia', fontSize: 18, marginTop: 8 },
  routineBody: { color: '#746451', fontSize: 11, lineHeight: 16, marginTop: 6 },
  routineTag: { color: '#9A6844', fontSize: 8, fontWeight: '800', letterSpacing: 0.65, marginTop: 12 },
  routineSettings: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4 },
  routineSettingsText: { color: colors.green, fontSize: 10, fontWeight: '700' },
  noticeToast: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.deepGreen, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 },
  noticeText: { color: '#FFFFFF', fontSize: 10, flex: 1 },
  noticeDismiss: { color: '#FFFFFF', fontSize: 19, paddingLeft: 10 },
  modalShade: { flex: 1, backgroundColor: 'rgba(16, 31, 23, 0.42)', justifyContent: 'flex-end' },
  mealModal: { backgroundColor: colors.paper, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 22, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 30 : 20 },
  modalHandle: { width: 35, height: 4, borderRadius: 2, backgroundColor: '#CAD0C7', alignSelf: 'center', marginBottom: 15 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 25, marginTop: 4 },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E9EDE5', alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { color: colors.ink, fontSize: 21, lineHeight: 24 },
  modalCopy: { color: '#778178', fontSize: 11, marginTop: 8 },
  mealOptionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 17 },
  mealOption: { width: '48%', minHeight: 52, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E6DD', borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11 },
  selectedMealOption: { borderColor: colors.green, backgroundColor: '#EDF3E9' },
  mealOptionEmoji: { color: colors.green, fontSize: 17 },
  mealOptionName: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  selectedMealText: { color: colors.green },
  quickMealEstimate: { borderTopWidth: 1, borderTopColor: '#E4E8DF', marginTop: 17, paddingTop: 13 },
  estimateTitle: { color: '#818A81', fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  estimateNumbers: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 5 },
  estimateDivider: { color: '#A1AAA0' },
  tabBar: { minHeight: 59, borderTopWidth: 1, borderTopColor: '#E7E9E1', backgroundColor: '#FFFFFF', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 4, paddingBottom: Platform.OS === 'ios' ? 3 : 5 },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 6 },
  tabDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#B8C0B7' },
  activeTabDot: { width: 16, backgroundColor: colors.green },
  tabText: { color: '#869087', fontSize: 8, fontWeight: '600' },
  activeTabText: { color: colors.green, fontWeight: '800' },
  placeholderSection: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EAE2', borderRadius: 8, padding: 18, marginTop: 7 },
  tabContent: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EAE2', borderRadius: 8, padding: 18, marginTop: 7 },
  placeholderTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 25, marginTop: 7 },
  placeholderBody: { color: '#727C74', fontSize: 13, lineHeight: 20, marginTop: 9 },
  addIngredientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  ingredientInput: { flex: 1 },
  addIngredientButton: { minHeight: 44, minWidth: 64, borderRadius: 7, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  addIngredientButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  inventorySummary: { color: '#707B72', fontSize: 10, fontWeight: '700', marginTop: 18, marginBottom: 4 },
  inventoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: '#EEF0EA', paddingVertical: 11 },
  inventoryItemName: { color: colors.ink, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  inventoryQuantity: { color: '#818A81', fontSize: 10, textAlign: 'right' },
  emptyInventory: { color: '#818A81', fontSize: 12, lineHeight: 18, paddingVertical: 15 },
  testTools: { backgroundColor: '#F5F6EF', borderWidth: 1, borderColor: '#E3E8DF', borderRadius: 7, padding: 13, marginTop: 17 },
  testToolsTitle: { color: colors.green, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  testToolsBody: { color: '#747E76', fontSize: 11, lineHeight: 17, marginTop: 6 },
  restoreButton: { minHeight: 39, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#A9BDAA', borderRadius: 6, marginTop: 12 },
  restoreButtonText: { color: colors.green, fontSize: 11, fontWeight: '700' },
  signOutButton: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 3 },
  signOutButtonText: { color: '#657168', fontSize: 10, fontWeight: '700' },
  clearDataButton: { minHeight: 39, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DAB7AE', borderRadius: 6, marginTop: 8 },
  clearDataButtonText: { color: '#A44F40', fontSize: 11, fontWeight: '700' },
  confirmClearPanel: { backgroundColor: '#FCEEEA', borderRadius: 6, padding: 11, marginTop: 9 },
  confirmClearText: { color: '#70453D', fontSize: 11, lineHeight: 16 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  cancelClearButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12 },
  cancelClearText: { color: '#6D766E', fontSize: 10, fontWeight: '700' },
  clearConfirmButton: { minHeight: 34, backgroundColor: '#A44F40', borderRadius: 5, justifyContent: 'center', paddingHorizontal: 11 },
  clearConfirmText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  comingSoon: { color: '#8A938C', fontSize: 10, textAlign: 'center', marginTop: 13 },
  savedProfilePanel: { backgroundColor: '#F5F6EF', borderWidth: 1, borderColor: '#E3E8DF', borderRadius: 7, padding: 13, marginTop: 15 },
  savedProfileName: { color: colors.ink, fontFamily: 'Georgia', fontSize: 17, marginTop: 8 },
  savedProfileLine: { color: '#6F796F', fontSize: 10, lineHeight: 16, marginTop: 4 },
  settingsScreen: { gap: 10, paddingTop: 6 },
  settingsScreenDark: { backgroundColor: '#18251E', paddingHorizontal: 12, paddingBottom: 12, borderRadius: 8 },
  settingsIntro: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E9E1', borderRadius: 7, padding: 14 },
  settingsIntroDark: { backgroundColor: '#FFFFFF' },
  settingsSection: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E9E1', borderRadius: 7, padding: 14 },
  settingsSectionTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 18, marginBottom: 3 },
  settingsHint: { color: '#79837A', fontSize: 10, lineHeight: 15, marginBottom: 7 },
  microTagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 6 },
  microTag: { backgroundColor: '#EEF3E9', borderRadius: 15, paddingHorizontal: 10, paddingVertical: 6 },
  microTagText: { color: colors.green, fontSize: 9, fontWeight: '700' },
  microCheckRow: { minHeight: 37, flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: '#EEF0EA' },
  microCheck: { width: 19, height: 19, borderWidth: 1, borderColor: '#AAB9AB', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  microCheckSelected: { backgroundColor: colors.green, borderColor: colors.green },
  microCheckMark: { color: '#FFFFFF', fontSize: 12, lineHeight: 15, fontWeight: '800' },
  microCheckLabel: { color: colors.ink, fontSize: 10, fontWeight: '600' },
  settingsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 7 },
  settingsNumberField: { flexGrow: 1, flexBasis: '46%', minWidth: 120 },
  settingLabel: { color: '#37443B', fontSize: 10, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  settingsInput: { minHeight: 39, borderWidth: 1, borderColor: '#DDE3D9', borderRadius: 5, backgroundColor: '#FFFFFF', color: colors.ink, paddingHorizontal: 10, fontSize: 12 },
  settingsChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2, marginBottom: 4 },
  settingsChoice: { minHeight: 31, justifyContent: 'center', borderWidth: 1, borderColor: '#DDE3D9', backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  settingsChoiceSelected: { borderColor: colors.green, backgroundColor: '#EAF1E7' },
  settingsChoiceText: { color: '#6C776D', fontSize: 9, fontWeight: '600' },
  settingsChoiceTextSelected: { color: colors.green, fontWeight: '800' },
  disabledControl: { opacity: 0.48 },
  calorieEstimatePanel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EDF3E9', borderRadius: 6, padding: 11, marginTop: 8 },
  estimateSide: { alignItems: 'flex-end' },
  settingsCalorieValue: { color: colors.green, fontFamily: 'Georgia', fontSize: 22, marginTop: 3 },
  bmrValue: { color: colors.ink, fontSize: 13, fontWeight: '800', marginTop: 5 },
  dietToggle: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#EEF0EA' },
  dietToggleLabel: { color: colors.ink, fontSize: 11, fontWeight: '600' },
  settingsAddRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2 },
  settingsTextInput: { flex: 1 },
  excludedFoodTag: { backgroundColor: '#F9EAE6', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 },
  excludedFoodTagText: { color: '#974F42', fontSize: 9, fontWeight: '700' },
  macroTotal: { color: colors.green, textAlign: 'right', fontSize: 10, fontWeight: '800', marginTop: 8 },
  macroControl: { flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderColor: '#EEF0EA', paddingVertical: 9 },
  macroLabelGroup: { flex: 1 },
  macroName: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  macroGrams: { color: '#848E85', fontSize: 9, marginTop: 3 },
  macroButton: { width: 30, height: 30, borderWidth: 1, borderColor: '#DCE3D9', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  macroPercent: { color: colors.green, fontSize: 12, fontWeight: '800', minWidth: 35, textAlign: 'center' },
  routineEditor: { backgroundColor: '#F7F8F3', borderWidth: 1, borderColor: '#E4E9E0', borderRadius: 6, padding: 10, marginTop: 8 },
  routineEditorTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  routineEditorCaption: { color: '#7B867D', fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  routineEditorActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  routineStateChip: { borderRadius: 12, backgroundColor: '#E7EAE4', paddingHorizontal: 9, paddingVertical: 4 },
  routineStateChipOn: { backgroundColor: '#DDEBDD' },
  routineStateText: { color: '#798379', fontSize: 9, fontWeight: '700' },
  routineStateTextOn: { color: colors.green },
  removeRoutineButton: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5E5E0' },
  removeRoutineText: { color: '#A44F40', fontSize: 17, lineHeight: 20 },
  routineFieldRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  routineTimeField: { width: 105 },
  routinePromptField: { flex: 1 },
  outlineAction: { minHeight: 37, borderWidth: 1, borderColor: '#A9BDAA', borderRadius: 5, alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  outlineActionText: { color: colors.green, fontSize: 10, fontWeight: '700' },
  stepperLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 7 },
  stepperButton: { width: 35, height: 35, borderWidth: 1, borderColor: '#D7E0D6', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepperText: { color: colors.green, fontSize: 18, lineHeight: 21, fontWeight: '700' },
  stepperValue: { color: colors.ink, minWidth: 76, textAlign: 'center', fontSize: 13, fontWeight: '800' },
  inventoryActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inventoryStep: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDE3D9', borderRadius: 14 },
  inventoryStepText: { color: colors.green, fontSize: 15, fontWeight: '700' },
  inventoryExpiry: { color: '#A66C30', fontSize: 9, marginLeft: 2 },
  inventoryRemove: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center' },
  inventoryRemoveText: { color: '#A44F40', fontSize: 18 },
  emptyRecipes: { borderTopWidth: 1, borderColor: '#EEF0EA', marginTop: 12, paddingTop: 12 },
  recipeListRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderColor: '#EEF0EA', paddingVertical: 11 },
  recipeListInfo: { flex: 1 },
  recipeListAction: { backgroundColor: colors.green, borderRadius: 5, minWidth: 54, minHeight: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  recipeListActionText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  trackerSummary: { backgroundColor: '#F5F6EF', borderRadius: 6, padding: 12, marginTop: 11 },
  darkRoot: { backgroundColor: '#18251E' },
  darkHome: { backgroundColor: '#18251E' },
  darkPrimaryText: { color: '#F3F5EF' },
  darkSecondaryText: { color: '#BAC5BA' },
  darkEyebrow: { color: '#B7D0B8' },
});
